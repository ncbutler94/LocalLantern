// backend/src/routes/messages/messages.js
import express from 'express';
import db from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ───────────────────────── DB bootstrap / migrations ───────────────────────── */
async function ensureDmTables() {
    // threads
    if (!(await db.schema.hasTable('dm_threads'))) {
        await db.schema.createTable('dm_threads', (t) => {
            t.increments('id').primary();
            t.timestamp('created_at').defaultTo(db.fn.now());
            t.timestamp('updated_at').defaultTo(db.fn.now());
        });
    }

    // participants
    if (!(await db.schema.hasTable('dm_participants'))) {
        await db.schema.createTable('dm_participants', (t) => {
            t.increments('id').primary();
            t.integer('thread_id').notNullable().index();
            t.integer('user_id').notNullable().index();
            t.unique(['thread_id', 'user_id']);
            // per-user hide/clear
            t.timestamp('cleared_at').nullable();
            t.timestamp('left_at').nullable();
        });
    } else {
        // add columns if missing (safe online migration)
        if (!(await db.schema.hasColumn('dm_participants', 'cleared_at'))) {
            await db.schema.table('dm_participants', (t) => t.timestamp('cleared_at').nullable());
        }
        if (!(await db.schema.hasColumn('dm_participants', 'left_at'))) {
            await db.schema.table('dm_participants', (t) => t.timestamp('left_at').nullable());
        }
    }

    // messages
    if (!(await db.schema.hasTable('dm_messages'))) {
        await db.schema.createTable('dm_messages', (t) => {
            t.increments('id').primary();
            t.integer('thread_id').notNullable().index();
            t.integer('from_user_id').notNullable().index();
            t.text('body').notNullable();
            t.timestamp('created_at').defaultTo(db.fn.now());
        });
    }
}

/* ───────────────────────── Helpers ───────────────────────── */
function toPublicUser(row) {
    if (!row) return null;
    return {
        id: row.id,
        public_id: row.public_id,
        handle: row.handle,
        first_name: row.first_name,
        last_name: row.last_name,
        avatar_url: row.avatar_url || row.profile_picture || null,
        profile_picture: row.profile_picture || null,
    };
}

async function loadUserBasic(id) {
    return db('users')
        .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture')
        .where({ id })
        .first();
}

async function findUserByKey(key) {
    const k = String(key || '').replace(/^@/, '');
    let u = await db('users')
        .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture')
        .whereRaw('LOWER(handle)=LOWER(?)', [k])
        .first();
    if (!u && /^\d+$/.test(k)) {
        const num = Number(k);
        u =
            (await db('users')
                .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture')
                .where({ public_id: num })
                .first()) ||
            (await db('users')
                .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture')
                .where({ id: num })
                .first());
    }
    return u;
}

// find a two‑party thread for (A,B). If not, create it.
// IMPORTANT: we never delete dm_participants rows, so we can always reuse
// the same thread id even after one user "removes for me".
async function getOrCreateThread(userIdA, userIdB) {
    if (userIdA === userIdB) throw new Error('cannot DM yourself');

    // find existing thread with exactly these two participants
    const aThreads = await db('dm_participants').where({ user_id: userIdA }).pluck('thread_id');
    let tid =
        aThreads.length > 0
            ? (await db('dm_participants')
                .whereIn('thread_id', aThreads)
                .andWhere({ user_id: userIdB })
                .first())?.thread_id
            : null;

    if (tid) {
        // sanity: ensure thread has exactly two participants
        const c = await db('dm_participants').where({ thread_id: tid }).count({ c: '*' }).first();
        if (Number(c?.c || 0) !== 2) tid = null;
    }

    if (!tid) {
        const [inserted] = await db('dm_threads').insert({}, ['id']);
        const newId = Array.isArray(inserted) ? inserted[0] : inserted;
        tid = newId;
        await db('dm_participants').insert([
            { thread_id: tid, user_id: userIdA, cleared_at: null, left_at: null },
            { thread_id: tid, user_id: userIdB, cleared_at: null, left_at: null },
        ]);
    }

    return tid;
}

/* ───────────────────────── Rate limit (anti‑spam) ─────────────────────────
   10 messages / 10 seconds per user across all threads.
   If exceeded → 2 minute cooldown.
----------------------------------------------------------------------------- */
const RATE = {
    windowMs: 10_000,
    burst: 10,
    cooldownMs: 120_000,
};
const rl = new Map(); // userId -> { times:number[], blockedUntil:number }

function checkAndBumpLimiter(userId) {
    const now = Date.now();
    const entry = rl.get(userId) || { times: [], blockedUntil: 0 };
    if (entry.blockedUntil && now < entry.blockedUntil) {
        return { ok: false, retryAt: entry.blockedUntil };
    }
    // drop old
    entry.times = entry.times.filter((t) => now - t < RATE.windowMs);
    if (entry.times.length >= RATE.burst) {
        entry.blockedUntil = now + RATE.cooldownMs;
        rl.set(userId, entry);
        return { ok: false, retryAt: entry.blockedUntil };
    }
    entry.times.push(now);
    rl.set(userId, entry);
    return { ok: true };
}

/* ───────────────────────── Router ───────────────────────── */
router.use(authenticateToken);

/**
 * GET /api/messages/conversations
 * Returns all 1:1 conversations for the viewer (hides ones you “removed”
 * until there’s a message newer than your left_at).
 */
router.get('/conversations', async (req, res, next) => {
    try {
        await ensureDmTables();
        const uid = req.user.id;

        const myParts = await db('dm_participants').where({ user_id: uid });
        if (!myParts.length) return res.json([]);

        const threadIds = myParts.map((p) => p.thread_id);

        // other participant for each thread
        const others = await db('dm_participants as p')
            .join('users as u', 'u.id', 'p.user_id')
            .select('p.thread_id', 'u.*')
            .whereIn('p.thread_id', threadIds)
            .andWhere('p.user_id', '<>', uid);

        const meByThread = Object.fromEntries(myParts.map((p) => [p.thread_id, p]));
        const otherByThread = {};
        for (const r of others) {
            otherByThread[r.thread_id] = toPublicUser(r);
        }

        // last message AFTER my cleared_at (blank slate) (or overall if null)
        const lastRows = await db('dm_messages')
            .select('thread_id')
            .max({ id: 'id' })
            .whereIn('thread_id', threadIds)
            .groupBy('thread_id');

        const lastMsgByThread = {};
        if (lastRows.length) {
            const ids = lastRows.map((r) => r.id);
            const rows = await db('dm_messages').whereIn('id', ids);
            rows.forEach((r) => {
                lastMsgByThread[r.thread_id] = r;
            });
        }

        const out = [];
        for (const tid of threadIds) {
            const me = meByThread[tid];
            const last = lastMsgByThread[tid];

            // hide if user left and there is no newer message than left_at
            if (me.left_at && (!last || new Date(last.created_at) <= new Date(me.left_at))) {
                continue;
            }

            // preview ignores messages before cleared_at
            const preview =
                last && (!me.cleared_at || new Date(last.created_at) > new Date(me.cleared_at))
                    ? (last.body || '').slice(0, 140)
                    : '';
            const updatedAt = last ? last.created_at : me.cleared_at || null;

            const meUser = await loadUserBasic(uid);
            out.push({
                id: tid,
                participants: [toPublicUser(meUser), otherByThread[tid]].filter(Boolean),
                lastMessage: preview ? { text: preview } : null,
                updatedAt,
            });
        }

        // newest first
        out.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        return res.json(out);
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/messages/conversations
 * Body: { recipient_ids: [userId,...] }  // we use the first id (DM).
 * Returns { id, participants, lastMessage, updatedAt }
 */
router.post('/conversations', async (req, res, next) => {
    try {
        await ensureDmTables();
        const uid = req.user.id;
        const ids = Array.isArray(req.body?.recipient_ids) ? req.body.recipient_ids : [];
        if (!ids.length) return res.status(400).json({ message: 'recipient_ids required' });

        const otherId = Number(ids[0]);
        if (!otherId || otherId === uid) return res.status(400).json({ message: 'Invalid recipient' });

        const other = await loadUserBasic(otherId);
        if (!other) return res.status(404).json({ message: 'User not found' });

        const tid = await getOrCreateThread(uid, otherId);

        // Unhide for me if I previously left
        await db('dm_participants').where({ thread_id: tid, user_id: uid }).update({ left_at: null });

        const meUser = await loadUserBasic(uid);
        return res.json({
            id: tid,
            participants: [toPublicUser(meUser), toPublicUser(other)],
            lastMessage: null,
            updatedAt: new Date().toISOString(),
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/messages/conversations/:id
 * Returns { messages: [{id,text,createdAt,sender}], participants:[...] }
 * Messages older than your cleared_at are filtered out.
 */
router.get('/conversations/:id', async (req, res, next) => {
    try {
        await ensureDmTables();
        const uid = req.user.id;
        const tid = Number(req.params.id || 0);
        if (!tid) return res.status(400).json({ message: 'Invalid conversation id' });

        const myPart = await db('dm_participants').where({ thread_id: tid, user_id: uid }).first();
        if (!myPart) return res.status(403).json({ message: 'Not allowed' });

        const othersPart = await db('dm_participants')
            .where({ thread_id: tid })
            .andWhere('user_id', '<>', uid)
            .first();
        const otherUser = othersPart ? await loadUserBasic(othersPart.user_id) : null;

        let q = db('dm_messages as m')
            .join('users as u', 'u.id', 'm.from_user_id')
            .where('m.thread_id', tid)
            .select(
                'm.id',
                'm.thread_id',
                'm.from_user_id',
                'm.body',
                'm.created_at',
                'u.id as u_id',
                'u.public_id as u_public_id',
                'u.handle as u_handle',
                'u.first_name as u_first_name',
                'u.last_name as u_last_name',
                'u.avatar_url as u_avatar_url',
                'u.profile_picture as u_profile_picture'
            )
            .orderBy('m.id', 'asc');

        if (myPart.cleared_at) {
            q = q.andWhere('m.created_at', '>', myPart.cleared_at);
        }

        const rows = await q;
        const messages = rows.map((r) => ({
            id: r.id,
            text: r.body,
            createdAt: r.created_at,
            sender: toPublicUser({
                id: r.u_id,
                public_id: r.u_public_id,
                handle: r.u_handle,
                first_name: r.u_first_name,
                last_name: r.u_last_name,
                avatar_url: r.u_avatar_url,
                profile_picture: r.u_profile_picture,
            }),
        }));

        const meUser = await loadUserBasic(uid);
        return res.json({
            id: tid,
            participants: [toPublicUser(meUser), toPublicUser(otherUser)].filter(Boolean),
            messages,
        });
    } catch (err) {
        next(err);
    }
});

/**
 * POST /api/messages/conversations/:id/messages
 * Body: { text }
 * Enforces 20k char cap + rate limit with cooldown.
 */
router.post('/conversations/:id/messages', async (req, res, next) => {
    try {
        await ensureDmTables();
        const uid = req.user.id;
        const tid = Number(req.params.id || 0);
        if (!tid) return res.status(400).json({ message: 'Invalid conversation id' });

        const myPart = await db('dm_participants').where({ thread_id: tid, user_id: uid }).first();
        if (!myPart) return res.status(403).json({ message: 'Not allowed' });

        // rate limiter
        const lim = checkAndBumpLimiter(uid);
        if (!lim.ok) {
            const secs = Math.max(0, Math.ceil((lim.retryAt - Date.now()) / 1000));
            return res.status(429).json({
                message: 'You are sending messages too fast. Please wait before sending more.',
                retry_after_seconds: secs,
                retry_at: new Date(lim.retryAt).toISOString(),
            });
        }

        const body = String(req.body?.text || '').trim();
        if (!body) return res.status(400).json({ message: 'Empty message' });

        const capped = body.slice(0, 20000); // server cap ( mirrors UI cap )

        const [inserted] = await db('dm_messages').insert(
            { thread_id: tid, from_user_id: uid, body: capped },
            ['id']
        );
        const msgId = Array.isArray(inserted) ? inserted[0] : inserted;

        const row = await db('dm_messages').where({ id: msgId }).first();
        await db('dm_threads').where({ id: tid }).update({ updated_at: db.fn.now() });

        // If anyone had "left", unhide for them (thread reappears as blank slate).
        await db('dm_participants')
            .where({ thread_id: tid })
            .andWhereNotNull('left_at')
            .update({ left_at: null });

        const meUser = await loadUserBasic(uid);
        return res.json({
            id: row.id,
            text: row.body,
            createdAt: row.created_at,
            sender: toPublicUser(meUser),
        });
    } catch (err) {
        next(err);
    }
});

/**
 * DELETE /api/messages/conversations/:id
 * “Remove conversation” (for me only):
 *   - sets cleared_at = now (blank slate)
 *   - sets left_at    = now (hide until a new message arrives)
 * Does not delete any rows/messages, so the other user keeps history.
 */
router.delete('/conversations/:id', async (req, res, next) => {
    try {
        await ensureDmTables();
        const uid = req.user.id;
        const tid = Number(req.params.id || 0);
        if (!tid) return res.status(400).json({ message: 'Invalid conversation id' });

        const mePart = await db('dm_participants').where({ thread_id: tid, user_id: uid }).first();
        if (!mePart) return res.status(403).json({ message: 'Not allowed' });

        await db('dm_participants')
            .where({ thread_id: tid, user_id: uid })
            .update({ cleared_at: db.fn.now(), left_at: db.fn.now() });

        return res.sendStatus(204);
    } catch (err) {
        next(err);
    }
});

/**
 * Socket.IO integration hook.
 * This is called from backend/src/index.js as:
 *   import { attachIO as attachMessagesIO } from './routes/messages/messages.js';
 *   attachMessagesIO(io);
 *
 * It's a safe no-op for now so the server can start without
 * requiring real-time handlers. You can add message-related
 * Socket.IO events inside this function later.
 */
export function attachIO(io) {
    if (!io) return;
    // placeholder – add real-time DM handlers here when needed, e.g.:
    // io.on('connection', (socket) => {
    //     socket.on('dm:join', ({ threadId }) => socket.join(`dm:${threadId}`));
    //     socket.on('dm:leave', ({ threadId }) => socket.leave(`dm:${threadId}`));
    // });
}

export default router;
