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

const toPublicUser = (u, extra = {}) => ({
    id: u.id,
    public_id: u.public_id,
    handle: u.handle,
    first_name: u.first_name,
    last_name: u.last_name,
    bio: u.bio || '',
    avatar_url: u.avatar_url || u.profile_picture || null,
    profile_picture: u.profile_picture || null,
    cover_url: u.cover_url || null,
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
    privacy_json: u.privacy_json || null,
    social_json: u.social_json || null,
    ...extra,
});

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
                'cover_url',
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
                'privacy_json',
                'social_json'
            )
            .where({ id: req.user.id })
            .first();

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
    upload.fields([{ name: 'profile_picture' }, { name: 'cover_photo' }]),
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
        body('cover_url').optional().isURL().trim(),
        body('handle')
            .optional()
            .custom((h) => !h || handleRegex.test(h))
            .withMessage('Handle may contain letters, numbers, dot, dash, underscore (3-30 chars).'),
        body('privacy_json')
            .optional()
            .custom((v) => {
                if (v == null) return true;
                if (typeof v === 'object') return true;
                if (typeof v === 'string') {
                    if (v === '[object Object]') return true;
                    try {
                        JSON.parse(v);
                        return true;
                    } catch {
                        return false;
                    }
                }
                return false;
            }),
    ],
    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        await ensureSocialColumn();

        const updates = {};
        const textFields = [
            'first_name',
            'last_name',
            'bio',
            'cover_url',
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

        const selectCols = ['id', 'handle', 'avatar_url', 'profile_picture', 'cover_url', 'privacy_json', 'relationship', 'social_json'];
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

        // privacy_json
        if (req.body.privacy_json != null) {
            const pj = parseMaybeJSON(req.body.privacy_json, undefined);
            if (pj !== undefined) updates.privacy_json = JSON.stringify(pj);
        }

        // deletion flags
        const deleteAvatar = toBool(req.body.delete_avatar);
        const deleteCover = toBool(req.body.delete_cover);

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
        const coverFile = req.files?.cover_photo?.[0];

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

            if (coverFile) {
                const ext = path.extname(coverFile.originalname) || '.jpg';
                const dest = `users/cover-photos/user_${req.user.id}_${Date.now()}${ext}`;
                const url = await uploadTo(coverFile.buffer, coverFile.mimetype, dest);
                updates.cover_url = url;
                await deleteFromGCSByUrl(current?.cover_url);
            } else if (deleteCover) {
                await deleteFromGCSByUrl(current?.cover_url);
                updates.cover_url = null;
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
                    'cover_url',
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
                    'privacy_json',
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
            'cover_url',
            'work_history_json',
            'education_history_json',
            'privacy_json',
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
                    lfRows = await db('lost_and_found').select('id', 'lost_or_found').whereIn('id', postIds);
                } catch {
                    lfRows = [];
                }
                const lostMap = Object.fromEntries(lfRows.map((r) => [r.id, r.lost_or_found]));

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

/* GET /users/social/:handleOrId — followers/following lists */
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
        if ('bio' in req.body) updates.bio = (req.body.bio ?? '') === '' ? '' : String(req.body.bio || '').slice(0, 500);
        if ('relationship' in req.body) updates.relationship = String(req.body.relationship || '').slice(0, 40) || null;
        if ('birthday' in req.body) updates.birthday = isoDate(req.body.birthday);
        if ('home_city' in req.body) updates.home_city = String(req.body.home_city || '').slice(0, 120) || null;
        if ('home_county' in req.body) updates.home_county = String(req.body.home_county || '').slice(0, 120) || null;

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

        if ('privacy_json' in req.body) {
            const priv = parseMaybeJSON(req.body.privacy_json, null);
            if (priv && typeof priv === 'object') {
                updates.privacy_json = JSON.stringify(priv);
            }
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
                    'cover_url',
                    'work_history_json',
                    'education_history_json',
                    'privacy_json',
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
                'cover_url',
                'work_history_json',
                'education_history_json',
                'privacy_json',
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
            .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture', 'cover_url', 'privacy_json', 'updated_at')
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

/* ────────────────────────── PUT /users/me/cover ─────────────────────── */
router.put('/me/cover', authenticateToken, upload.any(), async (req, res) => {
    try {
        const file = (req.files || []).find((f) => ['file', 'cover_file', 'cover'].includes(f.fieldname));
        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        const ext = path.extname(file.originalname) || '.jpg';
        const dest = `users/cover-photos/user_${req.user.id}_${Date.now()}${ext}`;
        const url = await uploadToGCS(file.buffer, file.mimetype, dest);

        const cur = await db('users').select('cover_url').where({ id: req.user.id }).first();
        await deleteFromGCSByUrl(cur?.cover_url);

        await db('users').where({ id: req.user.id }).update({ cover_url: url, updated_at: db.fn.now() });

        const u = await db('users')
            .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture', 'cover_url', 'privacy_json', 'updated_at')
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
        return res.status(500).json({ message: 'Failed to upload cover photo.' });
    }
});

/* ──────────────────────── DELETE /users/me/cover ────────────────────── */
router.delete('/me/cover', authenticateToken, async (req, res, next) => {
    try {
        const cur = await db('users').select('cover_url').where({ id: req.user.id }).first();
        await deleteFromGCSByUrl(cur?.cover_url);
        await db('users').where({ id: req.user.id }).update({ cover_url: null, updated_at: db.fn.now() });
        return res.sendStatus(204);
    } catch (err) {
        next(err);
    }
});

/* ===================== PROFILE PHOTOS (owner gallery) ====================== */

// list photos for a user
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
router.get('/photos/:photoId/comments', async (req, res, next) => {
    try {
        await ensurePhotoTables();
        const pid = Number(req.params.photoId);
        const rows = await db('user_photo_comments as c')
            .join('users as u', 'c.user_id', 'u.id')
            .select('c.id', 'c.photo_id', 'c.user_id', 'c.content', 'c.created_at', 'u.first_name', 'u.last_name', 'u.avatar_url', 'u.profile_picture')
            .where('c.photo_id', pid)
            .orderBy('c.created_at', 'desc')
            .limit(200);
        res.json(rows);
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
            .select('c.id', 'c.photo_id', 'c.user_id', 'c.content', 'c.created_at', 'u.first_name', 'u.last_name', 'u.avatar_url', 'u.profile_picture')
            .where('c.id', id)
            .first();
        res.json(c);
    } catch (err) {
        next(err);
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
