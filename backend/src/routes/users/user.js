// backend/src/routes/users/user.js
import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { body, validationResult } from 'express-validator';
import db from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';
import optionalAuth from '../../middleware/optionalAuth.js';

const router = express.Router();

/* ───────────────────────────── Robust GCS setup ─────────────────────────────
   Env:
   - GCP_PROJECT_ID
   - GOOGLE_APPLICATION_CREDENTIALS (file path)  OR  GCS_KEY_JSON / GOOGLE_APPLICATION_CREDENTIALS_JSON
   - GCS_BUCKET
---------------------------------------------------------------------------- */
function buildGCS() {
    const projectId = process.env.GCP_PROJECT_ID;
    const bucketName = process.env.GCS_BUCKET;
    const keyPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim();

    let credentials = null;

    // Prefer loading the JSON key from a file path (absolute or relative to cwd)
    if (keyPath) {
        try {
            const resolved = path.isAbsolute(keyPath) ? keyPath : path.resolve(process.cwd(), keyPath);
            const raw = fs.readFileSync(resolved, 'utf8');
            const json = JSON.parse(raw);
            const priv =
                typeof json.private_key === 'string'
                    ? json.private_key.replace(/\\n/g, '\n') // normalize escaped newlines
                    : json.private_key;
            if (json.client_email && priv) {
                credentials = { client_email: json.client_email, private_key: priv };
            }
        } catch {
            /* fall through to env JSON */
        }
    }

    // Fallback: allow inline JSON via env var(s)
    if (!credentials) {
        const inline =
            process.env.GCS_KEY_JSON ||
            process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
            process.env.GOOGLE_CLOUD_KEYFILE_JSON ||
            '';
        if (inline) {
            try {
                const json = JSON.parse(inline);
                const priv =
                    typeof json.private_key === 'string'
                        ? json.private_key.replace(/\\n/g, '\n')
                        : json.private_key;
                if (json.client_email && priv) {
                    credentials = { client_email: json.client_email, private_key: priv };
                }
            } catch {
                /* ignore */
            }
        }
    }

    const storage = credentials
        ? new Storage({ projectId, credentials })
        : new Storage({
            projectId,
            keyFilename: keyPath ? path.resolve(process.cwd(), keyPath) : undefined,
        });

    return { bucket: storage.bucket(bucketName) };
}

const { bucket } = buildGCS();

/* --------------------------------- Uploads -------------------------------- */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype?.startsWith('image/')) cb(new Error('Images only'));
        else cb(null, true);
    },
});

/* ------------------------------- Helpers ---------------------------------- */
const handleRegex = /^[a-zA-Z0-9_.-]{3,30}$/;

const existsCache = { table: {}, column: {} };
const hasTable = async (table) => {
    if (existsCache.table[table] != null) return existsCache.table[table];
    const ok = await db.schema.hasTable(table);
    existsCache.table[table] = ok;
    return ok;
};
const hasColumn = async (table, column) => {
    const k = `${table}.${column}`;
    if (existsCache.column[k] != null) return existsCache.column[k];
    const ok = await db.schema.hasColumn(table, column);
    existsCache.column[k] = ok;
    return ok;
};

const isoDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.valueOf()) ? null : d.toISOString().slice(0, 10);
};

const parseMaybeJSON = (val, fallback = {}) => {
    try {
        if (val == null || val === '') return fallback;
        if (typeof val === 'object') return val;
        if (typeof val === 'string') {
            if (val === '[object Object]') return fallback;
            return JSON.parse(val);
        }
        return fallback;
    } catch {
        return fallback;
    }
};

const toPublicUser = (u, extra = {}) => {
    if (!u) return null;
    return ({
        id: u.id,
        public_id: u.public_id,
        handle: u.handle,
        first_name: u.first_name,
        last_name: u.last_name,
        bio: u.bio || '',
        avatar_url: u.avatar_url || u.profile_picture || null,
        profile_picture: u.profile_picture || null,
        relationship: u.relationship ?? null,
        birthday: u.birthday || null,
        job_title: u.job_title || null,
        employer: u.employer || null,
        high_school: u.high_school || null,
        college: u.college || null,
        degree: u.degree || null,
        home_city: u.home_city || null,
        home_county: u.home_county || null,
        work_history_json: u.work_history_json || null,
        education_history_json: u.education_history_json || null,
        created_at: u.created_at,
        social_json: u.social_json || null,
        ...extra,
    });
};

async function showColumn(table, column) {
    try {
        const result = await db.raw('SHOW COLUMNS FROM ?? LIKE ?', [table, column]);
        return (Array.isArray(result[0]) ? result[0] : result)?.[0] || null;
    } catch {
        return null;
    }
}
async function isNumericColumn(table, column) {
    try {
        const row = await showColumn(table, column);
        const type = row?.Type || '';
        return /\b(int|decimal|float|double|tinyint|smallint|bigint)\b/i.test(type);
    } catch {
        return false;
    }
}
async function getEnumValues(table, column) {
    const row = await showColumn(table, column);
    const type = row?.Type || '';
    const m = type.match(/^enum\((.*)\)$/i);
    if (!m) return null;
    return m[1]
        .split(',')
        .map((s) => s.trim().replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'"));
}
const relToCode = (txt) => {
    const t = String(txt || '').toLowerCase().replace(/[’]/g, "'");
    if (t === 'single') return 1;
    if (t.includes('in a relationship') || t === 'in-relationship' || t === 'in relationship') return 2;
    if (t.includes('married')) return 3;
    if (t.includes('complicated') || t === "it's complicated" || t === 'its complicated' || t === 'its-complicated')
        return 4;
    return 0;
};
const relToEnum = (txt) => {
    const t = String(txt || '').trim().toLowerCase().replace(/[’]/g, "'");
    if (!t) return null;
    if (t === 'single') return 'single';
    if (t === 'in-relationship' || t === 'in relationship' || t === 'in a relationship') return 'in-relationship';
    if (t === 'married') return 'married';
    if (t === "it's complicated" || t === 'its complicated' || t === 'its-complicated') return 'its-complicated';
    if (t === 'prefer-not' || t === 'prefer not' || t === 'prefer not to say') return 'prefer-not';
    return null;
};
async function normalizeRelationship(input) {
    const numeric = await isNumericColumn('users', 'relationship');
    if (numeric) return relToCode(input);
    const enumVals = await getEnumValues('users', 'relationship');
    if (enumVals && enumVals.length) {
        const candidate = relToEnum(input);
        if (candidate && enumVals.includes(candidate)) return candidate;
        if (enumVals.includes('prefer-not')) return 'prefer-not';
        return null;
    }
    return relToEnum(input);
}
const toBool = (v) => ['1', 'true', 'on', 'yes'].includes(String(v || '').toLowerCase());

/* ------------------- Ensure extra tables / columns exist ------------------- */
async function ensureMessagesTable() {
    if (await hasTable('user_messages')) return;
    await db.schema.createTable('user_messages', (t) => {
        t.increments('id').primary();
        t.integer('from_user_id').notNullable().index();
        t.integer('to_user_id').notNullable().index();
        t.string('subject', 200).notNullable().defaultTo('');
        t.text('body').notNullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
    });
}
async function ensureHandleLogTable() {
    if (await hasTable('user_handle_changes')) return;
    await db.schema.createTable('user_handle_changes', (t) => {
        t.increments('id').primary();
        t.integer('user_id').notNullable().index();
        t.string('old_handle', 64).nullable();
        t.string('new_handle', 64).notNullable();
        t.timestamp('created_at').defaultTo(db.fn.now());
    });
}
async function ensureSocialColumn() {
    if (await hasColumn('users', 'social_json')) return;
    await db.schema.table('users', (t) => t.json('social_json').nullable());
}
async function ensurePhotoTables() {
    if (!(await hasTable('user_profile_photos'))) {
        await db.schema.createTable('user_profile_photos', (t) => {
            t.increments('id').primary();
            t.integer('user_id').notNullable().index();
            t.string('url', 500).notNullable();
            t.timestamp('created_at').defaultTo(db.fn.now());
        });
    }
    if (!(await hasTable('user_photo_likes'))) {
        await db.schema.createTable('user_photo_likes', (t) => {
            t.integer('photo_id').notNullable().index();
            t.integer('user_id').notNullable().index();
            t.timestamp('created_at').defaultTo(db.fn.now());
            t.primary(['photo_id', 'user_id']);
        });
    }
    if (!(await hasTable('user_photo_comment_likes'))) {
        await db.schema.createTable('user_photo_comment_likes', (t) => {
            t.integer('comment_id').notNullable().index();
            t.integer('user_id').notNullable().index();
            t.timestamp('created_at').defaultTo(db.fn.now());
            t.primary(['comment_id', 'user_id']);
        });
    }

    if (!(await hasTable('user_photo_comments'))) {
        await db.schema.createTable('user_photo_comments', (t) => {
            t.increments('id').primary();
            t.integer('photo_id').notNullable().index();
            t.integer('user_id').notNullable().index();
            t.text('content').notNullable();
            t.timestamp('created_at').defaultTo(db.fn.now());
        });
    }
}


async function ensurePhotoKindColumn() {
    if (await hasColumn('user_profile_photos', 'kind')) return;
    try {
        await db.schema.table('user_profile_photos', (t) => {
            t.string('kind', 24).nullable().index();
        });
    } catch {
        // ignore
    }
    existsCache.column['user_profile_photos.kind'] = true;
}

async function getOrCreateSpecialPhoto(userId, url) {
    const k = 'avatar';
    const existing = await db('user_profile_photos')
        .where({ user_id: userId })
        .andWhere('kind', k)
        .first();

    if (existing?.id) {
        if (String(existing.url || '') !== String(url || '')) {
            await db('user_profile_photos').where({ id: existing.id }).update({ url: String(url || '') });
        }
        return { id: existing.id, user_id: userId, url: String(url || ''), kind: k };
    }

    const [id] = await db('user_profile_photos').insert({
        user_id: userId,
        url: String(url || ''),
        kind: k,
    });
    return { id, user_id: userId, url: String(url || ''), kind: k };
}
/* --------------------------- GET /users/profile (me) ----------------------- */
router.get('/profile', authenticateToken, async (req, res, next) => {
    try {
        await ensureSocialColumn();
        const u = await db('users')
            .select(
                'id',
                'public_id',
                'handle',
                'first_name',
                'last_name',
                'bio',
                'avatar_url',
                'profile_picture',
                'relationship',
                'birthday',
                'job_title',
                'employer',
                'high_school',
                'college',
                'degree',
                'home_city',
                'home_county',
                'work_history_json',
                'education_history_json',
                'created_at',
                'updated_at',
                'social_json'
            )
            .where({ id: req.user.id })
            .first();

        if (!u) {
            return res.status(404).json({ error: 'User not found' });
        }

        // handle change stats (2 per 15 days)
        const WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
        await ensureHandleLogTable();
        const since = new Date(Date.now() - WINDOW_MS);
        const rows = await db('user_handle_changes')
            .where({ user_id: req.user.id })
            .andWhere('created_at', '>=', since)
            .orderBy('created_at', 'asc');
        const count = rows.length;
        const stats =
            count >= 2
                ? {
                    remaining: 0,
                    nextAllowed: new Date(new Date(rows[0].created_at).getTime() + WINDOW_MS),
                }
                : { remaining: 2 - count, nextAllowed: null };

        res.json({
            user: toPublicUser(u, {
                handle_change_stats: {
                    remaining: stats.remaining,
                    nextAllowed: stats.nextAllowed?.toISOString() || null,
                },
            }),
        });
    } catch (err) {
        next(err);
    }
});

/* --------------- PUT /users/profile (fields + images + handle) ------------- */
router.put(
    '/profile',
    authenticateToken,
    upload.fields([{ name: 'profile_picture' }]),
    [
        body('first_name').optional().isLength({ min: 1, max: 50 }).trim(),
        body('last_name').optional().isLength({ min: 1, max: 50 }).trim(),
        body('bio').optional().isLength({ max: 500 }).trim(),
        body('relationship').optional().isLength({ max: 40 }).trim(),
        body('birthday').optional().isISO8601(),
        body('job_title').optional().isLength({ max: 120 }).trim(),
        body('employer').optional().isLength({ max: 160 }).trim(),
        body('high_school').optional().isLength({ max: 160 }).trim(),
        body('college').optional().isLength({ max: 160 }).trim(),
        body('degree').optional().isLength({ max: 160 }).trim(),
        body('home_city').optional().isLength({ max: 120 }).trim(),
        body('home_county').optional().isLength({ max: 120 }).trim(),
        body('work_history_json').optional().isString(),
        body('education_history_json').optional().isString(),
        body('handle')
            .optional()
            .custom((h) => !h || handleRegex.test(h))
            .withMessage('Handle may contain letters, numbers, dot, dash, underscore (3-30 chars).'),    ],
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        await ensureSocialColumn();

        const updates = {};
        const textFields = [
            'first_name',
            'last_name',
            'bio',
            'job_title',
            'employer',
            'high_school',
            'college',
            'degree',
            'home_city',
            'home_county',
            'work_history_json',
            'education_history_json',
        ];
        textFields.forEach((f) => {
            if (req.body[f] != null) updates[f] = req.body[f];
        });
        if (req.body.birthday != null) updates.birthday = isoDate(req.body.birthday);

        const selectCols = ['id', 'handle', 'avatar_url', 'profile_picture', 'relationship', 'social_json'];
        if (await hasColumn('users', 'handle_changed_at')) selectCols.push('handle_changed_at');
        else if (await hasColumn('users', 'handle_last_changed_at')) selectCols.push('handle_last_changed_at');

        const current = await db('users').select(selectCols).where({ id: req.user.id }).first();

        // handle change policy
        if (req.body.handle != null && req.body.handle !== current.handle) {
            if (req.body.handle === '') return res.status(400).json({ message: 'Handle cannot be empty' });
            if (!handleRegex.test(req.body.handle))
                return res.status(400).json({
                    message: 'Handle may contain letters, numbers, dot, dash, underscore (3-30 chars).',
                });
            const clashUser = await db('users')
                .whereRaw('LOWER(handle)=LOWER(?)', [req.body.handle])
                .andWhereNot({ id: req.user.id })
                .first();
            if (clashUser) return res.status(409).json({ message: 'That profile URL is already taken' });

            const WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
            await ensureHandleLogTable();
            const since = new Date(Date.now() - WINDOW_MS);
            const rows = await db('user_handle_changes')
                .where({ user_id: req.user.id })
                .andWhere('created_at', '>=', since)
                .orderBy('created_at', 'asc');
            if (rows.length >= 2) {
                const nextAllowed = new Date(new Date(rows[0].created_at).getTime() + WINDOW_MS);
                return res.status(429).json({
                    message: `You can change your profile URL again on ${nextAllowed.toLocaleDateString()}.`,
                });
            }
            updates.handle = req.body.handle;
            if (await hasColumn('users', 'handle_changed_at')) updates.handle_changed_at = db.fn.now();
            else if (await hasColumn('users', 'handle_last_changed_at')) updates.handle_last_changed_at = db.fn.now();
        }

        // relationship normalize
        if (req.body.relationship !== undefined) {
            const normalized = await normalizeRelationship(req.body.relationship);
            updates.relationship = normalized;
        }

        // deletion flags
        const deleteAvatar = toBool(req.body.delete_avatar);
// upload helpers
        const uploadTo = (buf, contentType, destPath) =>
            new Promise((resolve, reject) => {
                const file = bucket.file(destPath);
                const stream = file.createWriteStream({
                    metadata: { contentType },
                    resumable: false,
                });
                stream.on('error', reject);
                stream.on('finish', () => resolve(`https://storage.googleapis.com/${bucket.name}/${destPath}`));
                stream.end(buf);
            });

        const profileFile = req.files?.profile_picture?.[0];
        try {
            if (profileFile) {
                const ext = path.extname(profileFile.originalname) || '.jpg';
                const dest = `users/profile-pictures/user_${req.user.id}_${Date.now()}${ext}`;
                const url = await uploadTo(profileFile.buffer, profileFile.mimetype, dest);
                updates.avatar_url = url;
                updates.profile_picture = url;
                // delete previous
                await deleteFromGCSByUrl(current?.avatar_url || current?.profile_picture);
            } else if (deleteAvatar) {
                await deleteFromGCSByUrl(current?.avatar_url || current?.profile_picture);
                updates.avatar_url = null;
                updates.profile_picture = null;
            }

            await db('users').where({ id: req.user.id }).update({ ...updates, updated_at: db.fn.now() });

            // if handle changed, log it
            if (updates.handle && updates.handle !== current.handle) {
                await ensureHandleLogTable();
                await db('user_handle_changes').insert({
                    user_id: req.user.id,
                    old_handle: current.handle || null,
                    new_handle: updates.handle,
                    created_at: db.fn.now(),
                });
            }

            const updated = await db('users')
                .select(
                    'id',
                    'public_id',
                    'handle',
                    'first_name',
                    'last_name',
                    'bio',
                    'avatar_url',
                    'profile_picture',
                    'relationship',
                    'birthday',
                    'job_title',
                    'employer',
                    'high_school',
                    'college',
                    'degree',
                    'home_city',
                    'home_county',
                    'work_history_json',
                    'education_history_json',
                    'created_at',
                    'social_json'
                )
                .where({ id: req.user.id })
                .first();

            res.json({
                user: toPublicUser(updated, {}),
            });
        } catch (err) {
            const msg = String(err?.message || '');
            if (msg.includes('invalid_grant')) {
                return res.status(502).json({
                    message:
                        'Cloud Storage auth failed (invalid service account credentials). Check GOOGLE_APPLICATIONS_CREDENTIALS path/keyfile and GCP_PROJECT_ID.',
                    code: 'gcs_invalid_grant',
                });
            }
            next(err);
        }
    }
);

/* ──────────────────────────── PUBLIC PROFILE / SOCIAL ───────────────────── */
const sanitize = (s, max) => {
    if (s == null) return null;
    return String(s).slice(0, max).trim() || null;
};
const deleteFromGCSByUrl = async (url) => {
    if (!url) return;
    try {
        const u = new URL(url);
        const objectPath = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
            .split('/')
            .slice(1)
            .join('/');
        if (!objectPath) return;
        await bucket.file(objectPath).delete({ ignoreNotFound: true });
    } catch {
        /* ignore */
    }
};
const uploadToGCS = (buf, contentType, destPath) =>
    new Promise((resolve, reject) => {
        const file = bucket.file(destPath);
        const stream = file.createWriteStream({
            metadata: { contentType },
            resumable: false,
        });
        stream.on('error', reject);
        stream.on('finish', () => resolve(`https://storage.googleapis.com/${bucket.name}/${destPath}`));
        stream.end(buf);
    });

/* GET /users/public/:handleOrId — public profile + recent posts */
router.get('/public/:handleOrId', async (req, res, next) => {
    try {
        const key = String(req.params.handleOrId || '').replace(/^@/, '');
        const COLS = [
            'id',
            'public_id',
            'handle',
            'first_name',
            'last_name',
            'bio',
            'relationship',
            'birthday',
            'job_title',
            'employer',
            'high_school',
            'college',
            'degree',
            'home_city',
            'home_county',
            'avatar_url',
            'profile_picture',
            'work_history_json',
            'education_history_json',
            'social_json',
            'created_at',
            'updated_at',
        ];

        let u = await db('users').select(COLS).whereRaw('LOWER(handle)=LOWER(?)', [key]).first();
        if (!u && /^\d+$/.test(key)) {
            const n = Number(key);
            u =
                (await db('users').select(COLS).where({ public_id: n }).first()) ||
                (await db('users').select(COLS).where({ id: n }).first());
        }
        if (!u) return res.status(404).json({ message: 'User not found' });

        // hydrate a simple posts feed (best-effort)
        const posts = await (async () => {
            try {
                const rows = await db('community_posts as p').select('p.*').where('p.user_id', u.id).orderBy('p.id', 'desc').limit(200);
                if (!rows.length) return [];
                const postIds = rows.map((p) => p.id);

                let photosRaw = [];
                try {
                    photosRaw = await db('community_photos')
                        .select('post_id', 'url', 'photo_url', 'path', 'position')
                        .whereIn('post_id', postIds)
                        .orderBy('position', 'asc');
                } catch {
                    photosRaw = [];
                }
                const photosByPost = {};
                for (const r of photosRaw) {
                    const url = r?.url || r?.photo_url || r?.path || null;
                    if (!url) continue;
                    (photosByPost[r.post_id] ||= []).push(url);
                }

                let lfRows = [];
                try {
                    const lfSelect = ['id', 'lost_or_found'];
                    try {
                        const hasResolvedAt = await db.schema.hasColumn('lost_and_found', 'resolved_at');
                        const hasResolvedMsg = await db.schema.hasColumn('lost_and_found', 'resolved_message');
                        const hasResolvedBy = await db.schema.hasColumn('lost_and_found', 'resolved_by_user_id');

                        if (hasResolvedAt) lfSelect.push('resolved_at');
                        if (hasResolvedMsg) lfSelect.push('resolved_message');
                        if (hasResolvedBy) lfSelect.push('resolved_by_user_id');
                    } catch {
                        // ignore
                    }

                    lfRows = await db('lost_and_found').select(lfSelect).whereIn('id', postIds);
                } catch {
                    lfRows = [];
                }
                const lostMap = Object.fromEntries(lfRows.map((r) => [r.id, r.lost_or_found]));

                const resolvedAtMap = Object.fromEntries(lfRows.map((r) => [r.id, r.resolved_at || null]));
                const resolvedMsgMap = Object.fromEntries(lfRows.map((r) => [r.id, r.resolved_message || '']));
                const resolvedByMap = Object.fromEntries(lfRows.map((r) => [r.id, r.resolved_by_user_id || null]));


                const counts = { likes: {}, comments: {}, reposts: {} };
                try {
                    const likeCounts = await db('post_likes').select('post_id').count({ c: '*' }).whereIn('post_id', postIds).groupBy('post_id');
                    counts.likes = Object.fromEntries(likeCounts.map((r) => [r.post_id, Number(r.c)]));
                } catch {}
                try {
                    const commentCounts = await db('post_comments').select('post_id').count({ c: '*' }).whereIn('post_id', postIds).groupBy('post_id');
                    counts.comments = Object.fromEntries(commentCounts.map((r) => [r.post_id, Number(r.c)]));
                } catch {}
                try {
                    const repostCounts = await db('post_reposts').select('post_id').count({ c: '*' }).whereIn('post_id', postIds).groupBy('post_id');
                    counts.reposts = Object.fromEntries(repostCounts.map((r) => [r.post_id, Number(r.c)]));
                } catch {}

                const author = await db('users')
                    .select('id', 'first_name', 'last_name', 'handle', 'profile_picture')
                    .where({ id: u.id })
                    .first();

                return rows.map((p) => ({
                    ...p,
                    first_name: author?.first_name || '',
                    last_name: author?.last_name || '',
                    handle: author?.handle || '',
                    avatar_url: author?.profile_picture || '',
                    date_created: p.date_created || p.created_at || p.posted_at,
                    likesCount: counts.likes[p.id] || 0,
                    commentsCount: counts.comments[p.id] || 0,
                    repostsCount: counts.reposts[p.id] || 0,
                    photos: photosByPost[p.id] || [],
                    lost_or_found: lostMap[p.id] || null,
                    resolved_at: resolvedAtMap[p.id] || null,
                    resolved_message: resolvedMsgMap[p.id] || '',
                    resolved_by_user_id: resolvedByMap[p.id] || null,
                    category: p.category || (lostMap[p.id] ? 'lost-found' : 'post'),
                }));
            } catch {
                return [];
            }
        })();

        return res.json({ profile: toPublicUser(u), activity: { posts } });
    } catch (err) {
        next(err);
    }
});


/* GET /users/:handleOrId/engagement/posts — liked + reposted Community posts
   Returns: { likes: [...], reposts: [...] }
   Notes:
   - Likes are pulled from post_likes WHERE category='community_post'
   - Reposts are pulled from post_reposts
   - Results are hydrated to match CommunityPostCard needs: author, photos, counts, lost & found state.
*/
/* GET /users/:handleOrId/engagement/posts — liked + reposted + commented Community activity
   Returns: { likes: [...], reposts: [...], comments: [...] }
   Query:
   - types=likes,reposts,comments (default: all)
   - limit=200 (max 500)

   Visibility:
   - Owner view (viewer==target) sees all.
   - For followers-only posts, a non-owner viewer can only see the post if:
       • the viewer follows the post author, AND
       • the target user ALSO follows the post author (unless author==target).
*/
router.get('/:handleOrId/engagement/posts', optionalAuth, async (req, res, next) => {
    try {
        await ensureSocialColumn();

        const key = String(req.params.handleOrId || '').replace(/^@/, '');
        const types = String(req.query.types || 'likes,reposts,comments')
            .split(',')
            .map((s) => String(s || '').trim().toLowerCase())
            .filter(Boolean);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10) || 200, 1), 500);

        // Resolve the target user id (handle OR numeric id/public_id)
        let u = await db('users')
            .select('id')
            .whereRaw('LOWER(handle)=LOWER(?)', [key])
            .first();

        if (!u && /^\d+$/.test(key)) {
            const n = Number(key);
            u =
                (await db('users').select('id').where({ public_id: n }).first()) ||
                (await db('users').select('id').where({ id: n }).first());
        }
        if (!u) return res.status(404).json({ message: 'User not found' });

        const targetId = Number(u.id);
        const viewerId = req.user?.id ? Number(req.user.id) : 0;
        const isOwnerView = viewerId && viewerId === targetId;

        const postLikesHasCategory = await hasColumn('post_likes', 'category');

        // Follow sets (from users.social_json.following)
        let viewerFollowing = new Set();
        let targetFollowing = new Set();

        if (!isOwnerView) {
            const [viewerRow, targetRow] = await Promise.all([
                viewerId ? db('users').select('id', 'social_json').where({ id: viewerId }).first() : Promise.resolve(null),
                db('users').select('id', 'social_json').where({ id: targetId }).first(),
            ]);

            const tgSJ = parseMaybeJSON(targetRow?.social_json, { followers: [], following: [] });
            targetFollowing = new Set(Array.isArray(tgSJ.following) ? tgSJ.following : []);

            if (viewerRow) {
                const vSJ = parseMaybeJSON(viewerRow.social_json, { followers: [], following: [] });
                viewerFollowing = new Set(Array.isArray(vSJ.following) ? vSJ.following : []);
            }
        }

        const canSeePost = (p) => {
            if (!p) return false;
            if (isOwnerView) return true;

            const vis = String(p.visibility || '').trim().toLowerCase();
            if (!vis || vis === 'public') return true;
            if (vis !== 'followers' && vis !== 'friends') return true;

            const authorId = Number(p.user_id);
            if (!Number.isFinite(authorId) || authorId <= 0) return true;

            // Viewer always sees their own posts
            if (viewerId && authorId === viewerId) return true;

            const viewerFollows = viewerId ? viewerFollowing.has(authorId) : false;
            const targetFollows = authorId === targetId ? true : targetFollowing.has(authorId);
            return viewerFollows && targetFollows;
        };

        const likedIds = types.includes('likes')
            ? await (async () => {
                try {
                    const q = db('post_likes')
                        .select('post_id')
                        .where({ user_id: targetId })
                        .orderBy('created_at', 'desc')
                        .limit(limit);

                    if (postLikesHasCategory) {
                        q.andWhere({ category: 'community_post' });
                    }

                    return await q;
                } catch {
                    return [];
                }
            })()
            : [];

        const repostIds = types.includes('reposts')
            ? await (async () => {
                try {
                    return await db('post_reposts')
                        .select('post_id')
                        .where({ user_id: targetId })
                        .orderBy('created_at', 'desc')
                        .limit(limit);
                } catch {
                    return [];
                }
            })()
            : [];

        const likedOrder = likedIds.map((r) => Number(r.post_id)).filter((n) => Number.isFinite(n) && n > 0);
        const repostOrder = repostIds.map((r) => Number(r.post_id)).filter((n) => Number.isFinite(n) && n > 0);

        const hydrateByOrder = async (idOrder) => {
            if (!idOrder.length) return [];

            const postRows = await db('community_posts').select('*').whereIn('id', idOrder);
            const postMap = new Map(postRows.map((p) => [Number(p.id), p]));
            const postIds = Array.from(postMap.keys());
            if (!postIds.length) return [];

            // Photos
            let photosRaw = [];
            try {
                photosRaw = await db('community_photos')
                    .select('post_id', 'url', 'photo_url', 'path', 'position')
                    .whereIn('post_id', postIds)
                    .orderBy('position', 'asc');
            } catch {
                photosRaw = [];
            }
            const photosByPost = {};
            for (const r of photosRaw) {
                const pid = Number(r.post_id);
                const url = r?.url || r?.photo_url || r?.path || null;
                if (!Number.isFinite(pid) || !url) continue;
                (photosByPost[pid] ||= []).push(url);
            }

            // Counts
            const counts = { likes: {}, comments: {}, reposts: {} };
            try {
                const likeCountsQ = db('post_likes')
                    .select('post_id')
                    .count({ c: '*' })
                    .whereIn('post_id', postIds);

                if (postLikesHasCategory) {
                    likeCountsQ.andWhere({ category: 'community_post' });
                }

                const likeCounts = await likeCountsQ.groupBy('post_id');
                counts.likes = Object.fromEntries(likeCounts.map((r) => [Number(r.post_id), Number(r.c) || 0]));
            } catch {}
            try {
                const commentCounts = await db('post_comments')
                    .select('post_id')
                    .count({ c: '*' })
                    .whereIn('post_id', postIds)
                    .groupBy('post_id');
                counts.comments = Object.fromEntries(commentCounts.map((r) => [Number(r.post_id), Number(r.c) || 0]));
            } catch {}
            try {
                const repostCounts = await db('post_reposts')
                    .select('post_id')
                    .count({ c: '*' })
                    .whereIn('post_id', postIds)
                    .groupBy('post_id');
                counts.reposts = Object.fromEntries(repostCounts.map((r) => [Number(r.post_id), Number(r.c) || 0]));
            } catch {}

            // Viewer flags
            let viewerLikeSet = new Set();
            let viewerRepostSet = new Set();
            if (viewerId) {
                try {
                    const rowsQ = db('post_likes')
                        .select('post_id')
                        .whereIn('post_id', postIds)
                        .andWhere({ user_id: viewerId });

                    if (postLikesHasCategory) {
                        rowsQ.andWhere({ category: 'community_post' });
                    }

                    const rows = await rowsQ;
                    viewerLikeSet = new Set(rows.map((r) => Number(r.post_id)).filter((n) => Number.isFinite(n)));
                } catch {
                    viewerLikeSet = new Set();
                }

                try {
                    const rows = await db('post_reposts')
                        .select('post_id')
                        .whereIn('post_id', postIds)
                        .andWhere({ user_id: viewerId });
                    viewerRepostSet = new Set(rows.map((r) => Number(r.post_id)).filter((n) => Number.isFinite(n)));
                } catch {
                    viewerRepostSet = new Set();
                }
            }

            // Authors
            const authorIds = Array.from(new Set(postRows.map((p) => Number(p.user_id)).filter((n) => Number.isFinite(n) && n > 0)));
            const authors = authorIds.length
                ? await db('users')
                    .select('id', 'first_name', 'last_name', 'handle', 'profile_picture', 'avatar_url')
                    .whereIn('id', authorIds)
                : [];
            const authorMap = new Map(authors.map((a) => [Number(a.id), a]));

            // Lost & Found state (+ optional resolution fields)
            let lfMap = new Map();
            try {
                const hasLF = await hasTable('lost_and_found');
                if (hasLF) {
                    const select = ['id', 'lost_or_found'];
                    if (await hasColumn('lost_and_found', 'resolved_at')) select.push('resolved_at');
                    if (await hasColumn('lost_and_found', 'resolved_message')) select.push('resolved_message');
                    if (await hasColumn('lost_and_found', 'resolved_by_user_id')) select.push('resolved_by_user_id');
                    const lfRows = await db('lost_and_found').select(select).whereIn('id', postIds);
                    lfMap = new Map(lfRows.map((r) => [Number(r.id), r]));
                }
            } catch {
                lfMap = new Map();
            }

            // Return in the exact order requested, filtered by visibility
            const out = [];
            for (const id of idOrder) {
                const p = postMap.get(Number(id));
                if (!p) continue;
                if (!canSeePost(p)) continue;

                const a = authorMap.get(Number(p.user_id)) || {};
                const lf = lfMap.get(Number(p.id)) || null;

                out.push({
                    ...p,
                    first_name: a.first_name || '',
                    last_name: a.last_name || '',
                    handle: a.handle || '',
                    avatar_url: a.profile_picture || a.avatar_url || '',
                    profile_picture: a.profile_picture || '',

                    posted_at: p.posted_at || p.date_created || p.created_at || null,
                    date_created: p.date_created || p.created_at || p.posted_at || null,

                    likesCount: counts.likes[Number(p.id)] || 0,
                    commentsCount: counts.comments[Number(p.id)] || 0,
                    repostsCount: counts.reposts[Number(p.id)] || 0,

                    photos: photosByPost[Number(p.id)] || [],

                    lost_or_found: lf ? (lf.lost_or_found || null) : null,
                    resolved_at: lf ? (lf.resolved_at || null) : null,
                    resolved_message: lf ? (lf.resolved_message || '') : '',
                    resolved_by_user_id: lf ? (lf.resolved_by_user_id || null) : null,

                    viewerLiked: viewerLikeSet.has(Number(p.id)),
                    viewerReposted: viewerRepostSet.has(Number(p.id)),
                });
            }

            return out;
        };

        const likes = types.includes('likes') ? await hydrateByOrder(likedOrder) : [];
        const reposts = types.includes('reposts') ? await hydrateByOrder(repostOrder) : [];

        // Comments activity: return comment rows + hydrated post preview
        let comments = [];
        if (types.includes('comments')) {
            try {
                const rows = await db('post_comments')
                    .select('id', 'post_id', 'parent_id', 'root_id', 'content', 'created_at')
                    .where({ user_id: targetId })
                    .orderBy('created_at', 'desc')
                    .limit(limit);

                const seen = new Set();
                const postOrder = [];
                for (const r of rows) {
                    const pid = Number(r.post_id);
                    if (!Number.isFinite(pid) || pid <= 0) continue;
                    if (seen.has(pid)) continue;
                    seen.add(pid);
                    postOrder.push(pid);
                }

                const hydratedPosts = await hydrateByOrder(postOrder);
                const postMap = new Map(hydratedPosts.map((p) => [Number(p.id), p]));

                comments = rows
                    .filter((r) => postMap.has(Number(r.post_id)))
                    .map((r) => ({
                        id: Number(r.id),
                        comment_id: Number(r.id),
                        post_id: Number(r.post_id),
                        parent_id: r.parent_id ? Number(r.parent_id) : null,
                        root_id: r.root_id ? Number(r.root_id) : null,
                        content: String(r.content || ''),
                        created_at: r.created_at || null,
                        post: postMap.get(Number(r.post_id)),
                    }));
            } catch {
                comments = [];
            }
        }

        return res.json({ likes, reposts, comments });
    } catch (err) {
        return next(err);
    }
});


router.get('/social/:handleOrId', async (req, res, next) => {
    try {
        await ensureSocialColumn();
        const key = String(req.params.handleOrId || '').replace(/^@/, '');

        const u =
            (await db('users').select('id', 'social_json').whereRaw('LOWER(handle)=LOWER(?)', [key]).first()) ||
            (/^\d+$/.test(key)
                ? (await db('users').select('id', 'social_json').where({ public_id: Number(key) }).first()) ||
                (await db('users').select('id', 'social_json').where({ id: Number(key) }).first())
                : null);

        if (!u) return res.status(404).json({ message: 'User not found' });

        const sj = parseMaybeJSON(u.social_json, { followers: [], following: [] });
        const followerIds = Array.isArray(sj.followers) ? sj.followers : [];
        const followingIds = Array.isArray(sj.following) ? sj.following : [];

        const loadUsers = async (ids) => {
            if (!ids.length) return [];
            const rows = await db('users')
                .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture')
                .whereIn('id', ids);
            const map = new Map(rows.map((r) => [r.id, r]));
            return ids
                .map((id) => map.get(id))
                .filter(Boolean)
                .map((r) => ({
                    id: r.id,
                    public_id: r.public_id,
                    handle: r.handle,
                    first_name: r.first_name,
                    last_name: r.last_name,
                    avatar_url: r.avatar_url || r.profile_picture || null,
                    profile_picture: r.profile_picture || null,
                }));
        };

        const [followers, following] = await Promise.all([loadUsers(followerIds), loadUsers(followingIds)]);
        return res.json({ followers, following, counts: { followers: followerIds.length, following: followingIds.length } });
    } catch (err) {
        next(err);
    }
});

/* ───────────────────────────── PUT /users/me ─────────────────────────
   FIX: Do NOT touch first_name / last_name here. Only update fields
   that are actually present in req.body. Prevents NULL writes on names.
--------------------------------------------------------------------- */
router.put('/me', authenticateToken, express.json({ limit: '1mb' }), async (req, res, next) => {
    try {
        await ensureSocialColumn();

        const updates = {};

        // Only include keys that are present; never write names here.
        if ('bio' in req.body) updates.bio = (req.body.bio ?? '') === '' ? '' : String(req.body.bio || '').slice(0, 50);
        if ('relationship' in req.body) updates.relationship = String(req.body.relationship || '').slice(0, 40) || null;
        if ('birthday' in req.body) updates.birthday = isoDate(req.body.birthday);
        if ('home_city' in req.body) updates.home_city = String(req.body.home_city || '').slice(0, 120) || null;
        if ('home_county' in req.body) updates.home_county = String(req.body.home_county || '').slice(0, 120) || null;

        // Account privacy: 0 = public, 1 = followers-only (if column exists)
        if ('is_private' in req.body) {
            const hasIsPrivate = await hasColumn('users', 'is_private');
            if (hasIsPrivate) {
                const v = req.body.is_private;
                updates.is_private = v === 1 || v === true || v === '1' ? 1 : 0;
            }
        }

        if ('work_history_json' in req.body) {
            const workJ = Array.isArray(req.body.work_history_json)
                ? req.body.work_history_json
                : parseMaybeJSON(req.body.work_history_json, []);
            updates.work_history_json = JSON.stringify(workJ);
        }
        if ('education_history_json' in req.body) {
            const eduJ = Array.isArray(req.body.education_history_json)
                ? req.body.education_history_json
                : parseMaybeJSON(req.body.education_history_json, []);
            updates.education_history_json = JSON.stringify(eduJ);
        }

        if ('social_json' in req.body) {
            // Merge incoming social.contact safely with what’s stored.
            const incomingSJ = parseMaybeJSON(req.body.social_json, null);
            if (incomingSJ && typeof incomingSJ === 'object') {
                const curRow = await db('users').select('social_json').where({ id: req.user.id }).first();
                const curSJ = parseMaybeJSON(curRow?.social_json, {});

                const cIn = parseMaybeJSON(incomingSJ.contact, null) || incomingSJ.contact || {};
                const digits = String(cIn.phone || '').replace(/\D/g, '').slice(0, 10);
                const phoneFmt =
                    digits.length > 6
                        ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
                        : digits.length > 3
                            ? `${digits.slice(0, 3)}-${digits.slice(3)}`
                            : digits;

                const ensureUrl = (u) => {
                    const v = String(u || '').trim();
                    if (!v) return '';
                    if (/^https?:\/\//i.test(v)) return v;
                    if (v.startsWith('www.')) return `https://${v}`;
                    return `https://${v}`;
                };
                const toSocialUrl = (v, base) => {
                    const s = String(v || '').trim();
                    if (!s) return '';
                    if (/^https?:\/\//i.test(s) || s.startsWith('www.')) return ensureUrl(s);
                    const handle = s.replace(/^@/, '');
                    return `${base}${handle}`;
                };

                const normalizedContact = {
                    phone: phoneFmt || '',
                    email: String(cIn.email || '').trim(),
                    facebook: toSocialUrl(cIn.facebook, 'https://facebook.com/'),
                    instagram: toSocialUrl(cIn.instagram, 'https://instagram.com/'),
                    website: ensureUrl(cIn.website || ''),
                };

                const mergedSJ = { ...curSJ, ...incomingSJ, contact: normalizedContact };
                // Preserve follower/following arrays to prevent tampering.
                if (Array.isArray(curSJ.followers)) mergedSJ.followers = curSJ.followers;
                if (Array.isArray(curSJ.following)) mergedSJ.following = curSJ.following;

                updates.social_json = JSON.stringify(mergedSJ);
            }
        }

        // If nothing to change, just return current user.
        if (Object.keys(updates).length === 0) {
            const u = await db('users')
                .select(
                    'id',
                    'public_id',
                    'handle',
                    'first_name',
                    'last_name',
                    'bio',
                    'relationship',
                    'birthday',
                    'job_title',
                    'employer',
                    'high_school',
                    'college',
                    'degree',
                    'home_city',
                    'home_county',
                    'avatar_url',
                    'profile_picture',
                    'work_history_json',
                    'education_history_json',
                    'social_json',
                    'created_at',
                    'updated_at'
                )
                .where({ id: req.user.id })
                .first();
            return res.json(toPublicUser(u));
        }

        await db('users').where({ id: req.user.id }).update({ ...updates, updated_at: db.fn.now() });

        const u = await db('users')
            .select(
                'id',
                'public_id',
                'handle',
                'first_name',
                'last_name',
                'bio',
                'relationship',
                'birthday',
                'job_title',
                'employer',
                'high_school',
                'college',
                'degree',
                'home_city',
                'home_county',
                'avatar_url',
                'profile_picture',
                'work_history_json',
                'education_history_json',
                'social_json',
                'created_at',
                'updated_at'
            )
            .where({ id: req.user.id })
            .first();

        return res.json(toPublicUser(u));
    } catch (err) {
        next(err);
    }
});

/* ─────────────────────────── PUT /users/me/avatar ─────────────────────── */
router.put('/me/avatar', authenticateToken, upload.any(), async (req, res) => {
    try {
        const file = (req.files || []).find((f) => ['file', 'avatar_file', 'avatar'].includes(f.fieldname));
        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        const ext = path.extname(file.originalname) || '.jpg';
        const dest = `users/profile-pictures/user_${req.user.id}_${Date.now()}${ext}`;
        const url = await uploadToGCS(file.buffer, file.mimetype, dest);

        const cur = await db('users').select('avatar_url', 'profile_picture').where({ id: req.user.id }).first();
        await deleteFromGCSByUrl(cur?.avatar_url || cur?.profile_picture);

        await db('users')
            .where({ id: req.user.id })
            .update({
                avatar_url: url,
                profile_picture: url,
                updated_at: db.fn.now(),
            });

        const u = await db('users')
            .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture', 'updated_at')
            .where({ id: req.user.id })
            .first();

        return res.json(toPublicUser(u));
    } catch (err) {
        const msg = String(err?.message || '');
        if (msg.includes('invalid_grant')) {
            return res.status(502).json({
                message:
                    'Cloud Storage auth failed (invalid service account credentials). Check GOOGLE_APPLICATIONS_CREDENTIALS path/keyfile and GCP_PROJECT_ID.',
                code: 'gcs_invalid_grant',
            });
        }
        return res.status(500).json({ message: 'Failed to upload avatar.' });
    }
});

/* ────────────────────────── DELETE /users/me/avatar ─────────────────── */
router.delete('/me/avatar', authenticateToken, async (req, res, next) => {
    try {
        const cur = await db('users').select('avatar_url', 'profile_picture').where({ id: req.user.id }).first();

        await deleteFromGCSByUrl(cur?.avatar_url || cur?.profile_picture);

        await db('users')
            .where({ id: req.user.id })
            .update({
                avatar_url: null,
                profile_picture: null,
                updated_at: db.fn.now(),
            });

        return res.sendStatus(204);
    } catch (err) {
        next(err);
    }
});





/* ===================== PROFILE PHOTOS (owner gallery) ====================== */

// list photos for a user

// Resolve the current avatar into a commentable photo record.
router.get('/photos/special/:handleOrId/:kind', optionalAuth, async (req, res, next) => {
    try {
        await ensurePhotoTables();
        await ensurePhotoKindColumn();

        const handleOrId = String(req.params.handleOrId || '').replace(/^@/, '');
        const kind = String(req.params.kind || '').toLowerCase().trim();
        if (kind !== 'avatar') {
            return res.status(400).json({ message: 'Invalid photo kind' });
        }

        let u = await db('users')
            .select('id', 'avatar_url', 'profile_picture')
            .whereRaw('LOWER(handle)=LOWER(?)', [handleOrId])
            .first();

        if (!u && /^\d+$/.test(handleOrId)) {
            const n = Number(handleOrId);
            u =
                (await db('users').select('id', 'avatar_url', 'profile_picture').where({ public_id: n }).first()) ||
                (await db('users').select('id', 'avatar_url', 'profile_picture').where({ id: n }).first());
        }

        if (!u) return res.status(404).json({ message: 'User not found' });

        const url = String(u.avatar_url || u.profile_picture || '').trim();

        if (!url) return res.status(404).json({ message: 'Photo not found' });

        const photo = await getOrCreateSpecialPhoto(Number(u.id), url);

        return res.json({ photo });
    } catch (err) {
        return next(err);
    }
});

router.get('/photos/:handleOrId', async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const { handleOrId } = req.params;
        let u = await db('users').select('id').whereRaw('LOWER(handle)=LOWER(?)', [handleOrId]).first();
        if (!u && /^\d+$/.test(handleOrId)) {
            u =
                (await db('users').select('id').where({ public_id: Number(handleOrId) }).first()) ||
                (await db('users').select('id').where({ id: Number(handleOrId) }).first());
        }
        if (!u) return res.status(404).json({ message: 'User not found' });

        const items = await db('user_profile_photos').where({ user_id: u.id }).orderBy('created_at', 'desc').limit(20);

        res.json({ photos: items });
    } catch (err) {
        next(err);
    }
});

// upload photos (owner only)
router.post('/photos', authenticateToken, upload.array('photos', 20), async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const currentCount = await db('user_profile_photos').where({ user_id: req.user.id }).count({ c: '*' }).first();
        const remaining = 20 - Number(currentCount?.c || 0);
        if (remaining <= 0) return res.status(400).json({ message: 'You already have 20 photos.' });

        const files = (req.files || []).slice(0, remaining);
        if (files.length === 0) return res.status(400).json({ message: 'No photos to upload.' });

        const saved = [];
        for (let i = 0; i < files.length; i += 1) {
            const f = files[i];
            const ext = path.extname(f.originalname) || '.jpg';
            const dest = `users/user_profile_photos/user_${req.user.id}_${Date.now()}_${i}${ext}`;
            const url = await uploadToGCS(f.buffer, f.mimetype, dest);
            const [id] = await db('user_profile_photos').insert({
                user_id: req.user.id,
                url,
            });
            saved.push({ id, url, user_id: req.user.id });
        }

        const all = await db('user_profile_photos').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(20);
        res.json({ photos: all });
    } catch (err) {
        next(err);
    }
});

// delete a photo (owner only)
router.delete('/photos/:photoId', authenticateToken, async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const photo = await db('user_profile_photos').where({ id: Number(req.params.photoId) }).first();
        if (!photo) return res.status(404).json({ message: 'Photo not found' });
        if (photo.user_id !== req.user.id) return res.status(403).json({ message: 'Not allowed' });

        await deleteFromGCSByUrl(photo.url);
        await db('user_photo_likes').where({ photo_id: photo.id }).del();
        await db('user_photo_comments').where({ photo_id: photo.id }).del();
        await db('user_profile_photos').where({ id: photo.id }).del();

        const all = await db('user_profile_photos').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(20);
        res.json({ photos: all });
    } catch (err) {
        next(err);
    }
});

// like toggle
router.post('/photos/:photoId/like', authenticateToken, async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const pid = Number(req.params.photoId);
        const row = await db('user_photo_likes').where({ photo_id: pid, user_id: req.user.id }).first();
        if (row) {
            await db('user_photo_likes').where({ photo_id: pid, user_id: req.user.id }).del();
        } else {
            await db('user_photo_likes').insert({ photo_id: pid, user_id: req.user.id });
        }
        const c = await db('user_photo_likes').where({ photo_id: pid }).count({ c: '*' }).first();
        res.json({ liked: !row, likes: Number(c?.c || 0) });
    } catch (err) {
        next(err);
    }
});

// photo comments

// photo comments
router.get('/photos/:photoId/comments', optionalAuth, async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const pid = Number(req.params.photoId);
        const sort = String(req.query.sort || 'popular').toLowerCase() === 'newest' ? 'newest' : 'popular';

        const likeAgg = db('user_photo_comment_likes')
            .select('comment_id')
            .count({ like_count: '*' })
            .groupBy('comment_id')
            .as('cl');

        let q = db('user_photo_comments as c')
            .join('users as u', 'c.user_id', 'u.id')
            .leftJoin(likeAgg, 'c.id', 'cl.comment_id')
            .select(
                'c.id',
                'c.photo_id',
                'c.user_id',
                'c.content',
                'c.created_at',
                'u.first_name',
                'u.last_name',
                'u.handle',
                'u.public_id',
                'u.avatar_url',
                'u.profile_picture',
                db.raw('COALESCE(cl.like_count, 0) as like_count')
            )
            .where('c.photo_id', pid);

        if (sort === 'newest') {
            q = q.orderBy('c.created_at', 'desc');
        } else {
            q = q.orderBy([{ column: 'like_count', order: 'desc' }, { column: 'c.created_at', order: 'desc' }]);
        }

        const rows = await q;

        const viewerId = req.user?.id ? Number(req.user.id) : 0;
        let likedSet = new Set();
        if (viewerId && rows.length) {
            const ids = rows.map((r) => Number(r.id)).filter(Boolean);
            const liked = await db('user_photo_comment_likes')
                .select('comment_id')
                .where({ user_id: viewerId })
                .whereIn('comment_id', ids);
            likedSet = new Set(liked.map((x) => Number(x.comment_id)));
        }

        const out = rows.map((r) => ({
            ...r,
            viewer_liked: viewerId ? likedSet.has(Number(r.id)) : false,
        }));

        res.json({ comments: out });
    } catch (err) {
        next(err);
    }
});
router.post('/photos/:photoId/comments', authenticateToken, [body('content').isLength({ min: 1, max: 1000 })], async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        await ensurePhotoTables();
        const pid = Number(req.params.photoId);
        const [id] = await db('user_photo_comments').insert({
            photo_id: pid,
            user_id: req.user.id,
            content: String(req.body.content || '').slice(0, 1000),
        });
        const c = await db('user_photo_comments as c')
            .join('users as u', 'c.user_id', 'u.id')
            .select('c.id', 'c.photo_id', 'c.user_id', 'c.content', 'c.created_at', 'u.first_name', 'u.last_name', 'u.handle', 'u.public_id', 'u.avatar_url', 'u.profile_picture')
            .where('c.id', id)
            .first();
        res.json(c);
    } catch (err) {
        next(err);
    }
});



/* DELETE /users/photos/comments/:commentId ---------------------------------- */
router.delete('/photos/comments/:commentId', authenticateToken, async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const cid = Number(req.params.commentId);
        if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ message: 'Invalid comment' });

        const comment = await db('user_photo_comments').select('id', 'photo_id', 'user_id').where({ id: cid }).first();
        if (!comment) return res.status(404).json({ message: 'Comment not found' });

        const photo = await db('user_profile_photos').select('id', 'user_id').where({ id: comment.photo_id }).first();
        const ownerId = photo?.user_id ?? null;

        const me = req.user?.id;
        const isAuthor = Number(comment.user_id) === Number(me);
        const isOwner = ownerId != null && Number(ownerId) === Number(me);

        if (!isAuthor && !isOwner) return res.status(403).json({ message: 'Not allowed' });

        await db.transaction(async (trx) => {
            await trx('user_photo_comment_likes').where({ comment_id: cid }).del();
            await trx('user_photo_comments').where({ id: cid }).del();
        });

        return res.json({ deleted: true, id: cid });
    } catch (err) {
        return next(err);
    }
});

router.post('/photos/comments/:commentId/like', authenticateToken, async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const cid = Number(req.params.commentId);
        if (!cid) return res.status(400).json({ message: 'Invalid comment' });

        const exists = await db('user_photo_comments').where({ id: cid }).first();
        if (!exists) return res.status(404).json({ message: 'Comment not found' });

        const row = await db('user_photo_comment_likes').where({ comment_id: cid, user_id: req.user.id }).first();
        if (row) {
            await db('user_photo_comment_likes').where({ comment_id: cid, user_id: req.user.id }).del();
        } else {
            await db('user_photo_comment_likes').insert({ comment_id: cid, user_id: req.user.id });
        }

        const c = await db('user_photo_comment_likes').where({ comment_id: cid }).count({ c: '*' }).first();
        return res.json({ liked: !row, likes: Number(c?.c || 0) });
    } catch (err) {
        return next(err);
    }
});

/* --------------------------- USER SEARCH (share) --------------------------- */
router.get('/search', async (req, res, next) => {
    try {
        const { q = '', county = '', city = '' } = req.query;
        const qb = db('users')
            .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture', 'home_city', 'home_county')
            .limit(60)
            .orderBy('first_name', 'asc');
        if (q) qb.whereRaw("LOWER(CONCAT_WS(' ', first_name, last_name, handle)) LIKE ?", [`%${String(q).toLowerCase()}%`]);
        if (county) qb.andWhereRaw('LOWER(home_county) = LOWER(?)', [String(county)]);
        if (city) qb.andWhereRaw('LOWER(home_city) = LOWER(?)', [String(city)]);
        const rows = await qb;
        res.json(rows.map((u) => toPublicUser(u)));
    } catch (err) {
        next(err);
    }
});

/* ----------------------------- POST /users/follow -------------------------- */
router.post(
    '/follow',
    authenticateToken,
    [body('target_id').isInt(), body('action').isIn(['follow', 'unfollow'])],
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        await ensureSocialColumn();

        const me = req.user.id;
        const targetId = Number(req.body.target_id);
        if (targetId === me) return res.status(400).json({ message: 'Cannot follow yourself' });

        const [meRow, tgRow] = await Promise.all([
            db('users').select('id', 'social_json').where({ id: me }).first(),
            db('users').select('id', 'social_json').where({ id: targetId }).first(),
        ]);
        if (!tgRow) return res.status(404).json({ message: 'Target not found' });

        const meSJ = parseMaybeJSON(meRow.social_json, { followers: [], following: [] });
        const tgSJ = parseMaybeJSON(tgRow.social_json, { followers: [], following: [] });

        const already = Array.isArray(meSJ.following) && meSJ.following.includes(targetId);

        if (req.body.action === 'follow') {
            if (!already) {
                meSJ.following = Array.from(new Set([...(meSJ.following || []), targetId]));
                tgSJ.followers = Array.from(new Set([...(tgSJ.followers || []), me]));
            }
        } else {
            if (already) {
                meSJ.following = (meSJ.following || []).filter((id) => id !== targetId);
                tgSJ.followers = (tgSJ.followers || []).filter((id) => id !== me);
            }
        }

        await Promise.all([
            db('users').where({ id: me }).update({ social_json: JSON.stringify(meSJ) }),
            db('users').where({ id: targetId }).update({ social_json: JSON.stringify(tgSJ) }),
        ]);

        res.json({
            ok: true,
            isFollowing: req.body.action === 'follow',
            counts: {
                me_following: meSJ.following?.length || 0,
                target_followers: tgSJ.followers?.length || 0,
            },
        });
    }
);

export default router;
