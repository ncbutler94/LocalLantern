import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import db from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ───────────────────────────── Robust GCS setup ─────────────────────────────
   Env you already have:
   - GCP_PROJECT_ID
   - GOOGLE_APPLICATION_CREDENTIALS (file path)  OR  GCS_KEY_JSON / GOOGLE_APPLICATIONS_CREDENTIALS_JSON
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
            const resolved = path.isAbsolute(keyPath)
                ? keyPath
                : path.resolve(process.cwd(), keyPath);
            const raw = fs.readFileSync(resolved, 'utf8');
            const json = JSON.parse(raw);
            const priv =
                typeof json.private_key === 'string'
                    ? json.private_key.replace(/\\n/g, '\n') // normalize if escaped
                    : json.private_key;
            if (json.client_email && priv) {
                credentials = { client_email: json.client_email, private_key: priv };
            }
        } catch {
            /* fall through to env JSON */
        }
    }

    // Fallback: allow inline JSON via env var
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

/* ───────────────────────────── Upload setup ────────────────────────── */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype?.startsWith('image/')) cb(new Error('Images only'));
        else cb(null, true);
    },
});

/* ───────────────────────────── Helpers ─────────────────────────────── */
const parseMaybeJSON = (v, fallback) => {
    if (v == null) return fallback;
    if (typeof v === 'object') return v;
    try {
        return JSON.parse(v);
    } catch {
        return fallback;
    }
};
const isoDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.valueOf()) ? null : d.toISOString().slice(0, 10);
};
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
        stream.on('finish', () =>
            resolve(`https://storage.googleapis.com/${bucket.name}/${destPath}`)
        );
        stream.end(buf);
    });

/* DB utilities */
async function ensureSocialColumn() {
    const has = await db.schema.hasColumn('users', 'social_json');
    if (!has) {
        await db.schema.table('users', (t) => t.json('social_json').nullable());
    }
}

/* Shape the DB row into what the SPA expects */
function toPublicUser(u) {
    if (!u) return null;
    return {
        id: u.id,
        public_id: u.public_id,
        handle: u.handle,
        first_name: u.first_name,
        last_name: u.last_name,
        bio: u.bio || '',
        relationship: u.relationship || null,
        birthday: u.birthday || null,
        job_title: u.job_title || null,
        employer: u.employer || null,
        high_school: u.high_school || null,
        college: u.college || null,
        degree: u.degree || null,
        home_city: u.home_city || null,
        home_county: u.home_county || null,
        avatar_url: u.avatar_url || u.profile_picture || null,
        profile_picture: u.profile_picture || null,
        cover_url: u.cover_url || null,
        work_history_json: parseMaybeJSON(u.work_history_json, []),
        education_history_json: parseMaybeJSON(u.education_history_json, []),
        privacy_json: parseMaybeJSON(u.privacy_json, {}),
        social_json: parseMaybeJSON(u.social_json, {}),
        created_at: u.created_at,
        updated_at: u.updated_at,
    };
}

/** helper: find user by handle (case‑insens), public_id, or id */
async function findUserByKey(key, columns = ['*']) {
    const k = String(key || '').replace(/^@/, '');
    let u = await db('users')
        .select(columns)
        .whereRaw('LOWER(handle)=LOWER(?)', [k])
        .first();
    if (!u && /^\d+$/.test(k)) {
        const n = Number(k);
        u =
            (await db('users').select(columns).where({ public_id: n }).first()) ||
            (await db('users').select(columns).where({ id: n }).first());
    }
    return u;
}

/** helper: hydrate a user's own posts for the profile feed */
async function hydrateUserPosts(userId, limit = 200) {
    try {
        const posts = await db('community_posts as p')
            .select('p.*')
            .where('p.user_id', userId)
            .orderBy('p.id', 'desc')
            .limit(limit);

        if (!posts.length) return [];

        const postIds = posts.map((p) => p.id);

        // photos tolerant of url/photo_url/path
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

        // Lost/Found flag (needed to render "Lost" vs "Found" on profile cards)
        let lfRows = [];
        try {
            lfRows = await db('lost_and_found')
                .select('id', 'lost_or_found')
                .whereIn('id', postIds);
        } catch {
            lfRows = [];
        }
        const lostMap = Object.fromEntries(lfRows.map((r) => [r.id, r.lost_or_found]));

        // counts (best‑effort)
        const counts = { likes: {}, comments: {}, reposts: {} };
        try {
            const likeCounts = await db('post_likes')
                .select('post_id')
                .count({ c: '*' })
                .whereIn('post_id', postIds)
                .groupBy('post_id');
            counts.likes = Object.fromEntries(
                likeCounts.map((r) => [r.post_id, Number(r.c)])
            );
        } catch {}
        try {
            const commentCounts = await db('post_comments')
                .select('post_id')
                .count({ c: '*' })
                .whereIn('post_id', postIds)
                .groupBy('post_id');
            counts.comments = Object.fromEntries(
                commentCounts.map((r) => [r.post_id, Number(r.c)])
            );
        } catch {}
        try {
            const repostCounts = await db('post_reposts')
                .select('post_id')
                .count({ c: '*' })
                .whereIn('post_id', postIds)
                .groupBy('post_id');
            counts.reposts = Object.fromEntries(
                repostCounts.map((r) => [r.post_id, Number(r.c)])
            );
        } catch {}

        // author details
        const author = await db('users')
            .select('id', 'first_name', 'last_name', 'handle', 'profile_picture')
            .where({ id: userId })
            .first();

        return posts.map((p) => ({
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
            lost_or_found: lostMap[p.id] || null, // ← include lost/found
            category:
                p.category ||
                (lostMap[p.id] ? 'lost-found' : p.category || 'post'),
        }));
    } catch {
        return [];
    }
}

/* ──────────────────────────── GET /users/public/:handleOrId ─────────────── */
router.get('/public/:handleOrId', async (req, res, next) => {
    try {
        const key = req.params.handleOrId;
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
        const u = await findUserByKey(key, COLS);
        if (!u) return res.status(404).json({ message: 'User not found' });

        const posts = await hydrateUserPosts(u.id, 200);

        return res.json({
            profile: toPublicUser(u),
            activity: { posts },
        });
    } catch (err) {
        next(err);
    }
});

/* ─────────────────────────── GET /users/social/:handleOrId ────────────────
   Returns follower/following lists (lightweight user objects) + counts.
----------------------------------------------------------------------------- */
router.get('/social/:handleOrId', async (req, res, next) => {
    try {
        await ensureSocialColumn();
        const u = await findUserByKey(req.params.handleOrId, ['id', 'social_json']);
        if (!u) return res.status(404).json({ message: 'User not found' });

        const sj = parseMaybeJSON(u.social_json, { followers: [], following: [] });
        const followerIds = Array.isArray(sj.followers) ? sj.followers : [];
        const followingIds = Array.isArray(sj.following) ? sj.following : [];

        const loadUsers = async (ids) => {
            if (!ids.length) return [];
            const rows = await db('users')
                .select('id', 'public_id', 'handle', 'first_name', 'last_name', 'avatar_url', 'profile_picture')
                .whereIn('id', ids);
            const map = new Map(rows.map(r => [r.id, r]));
            // keep original order if you like; otherwise return rows
            return ids
                .map(id => map.get(id))
                .filter(Boolean)
                .map(r => ({
                    id: r.id,
                    public_id: r.public_id,
                    handle: r.handle,
                    first_name: r.first_name,
                    last_name: r.last_name,
                    avatar_url: r.avatar_url || r.profile_picture || null,
                    profile_picture: r.profile_picture || null,
                }));
        };

        const [followers, following] = await Promise.all([
            loadUsers(followerIds),
            loadUsers(followingIds),
        ]);

        return res.json({
            followers,
            following,
            counts: { followers: followerIds.length, following: followingIds.length },
        });
    } catch (err) {
        next(err);
    }
});

/* ───────────────────────────── PUT /users/me ───────────────────────── */
router.put(
    '/me',
    authenticateToken,
    express.json({ limit: '1mb' }),
    async (req, res, next) => {
        try {
            const updates = {};
            updates.bio = sanitize(req.body.bio, 500) ?? '';
            updates.relationship = sanitize(req.body.relationship, 40);
            updates.birthday = isoDate(req.body.birthday);
            updates.home_city = sanitize(req.body.home_city, 120);
            updates.home_county = sanitize(req.body.home_county, 120);

            const workJ = Array.isArray(req.body.work_history_json)
                ? req.body.work_history_json
                : parseMaybeJSON(req.body.work_history_json, []);
            const eduJ = Array.isArray(req.body.education_history_json)
                ? req.body.education_history_json
                : parseMaybeJSON(req.body.education_history_json, []);
            updates.work_history_json = JSON.stringify(workJ);
            updates.education_history_json = JSON.stringify(eduJ);

            const priv = parseMaybeJSON(req.body.privacy_json, null);
            if (priv && typeof priv === 'object') {
                updates.privacy_json = JSON.stringify(priv);
            }

            await db('users')
                .where({ id: req.user.id })
                .update({ ...updates, updated_at: db.fn.now() });

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
    }
);

/* ───────────────────────── PUT /users/me/avatar ─────────────────────── */
router.put('/me/avatar', authenticateToken, upload.any(), async (req, res) => {
    try {
        const file = (req.files || []).find((f) =>
            ['file', 'avatar_file', 'avatar'].includes(f.fieldname)
        );
        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        const ext = path.extname(file.originalname) || '.jpg';
        const dest = `users/profile-pictures/user_${req.user.id}_${Date.now()}${ext}`;
        const url = await uploadToGCS(file.buffer, file.mimetype, dest);

        const cur = await db('users')
            .select('avatar_url', 'profile_picture')
            .where({ id: req.user.id })
            .first();
        await deleteFromGCSByUrl(cur?.avatar_url || cur?.profile_picture);

        await db('users')
            .where({ id: req.user.id })
            .update({
                avatar_url: url,
                profile_picture: url,
                updated_at: db.fn.now(),
            });

        const u = await db('users')
            .select(
                'id',
                'public_id',
                'handle',
                'first_name',
                'last_name',
                'avatar_url',
                'profile_picture',
                'cover_url',
                'privacy_json',
                'updated_at'
            )
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
        const cur = await db('users')
            .select('avatar_url', 'profile_picture')
            .where({ id: req.user.id })
            .first();

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
        const file = (req.files || []).find((f) =>
            ['file', 'cover_file', 'cover'].includes(f.fieldname)
        );
        if (!file) return res.status(400).json({ message: 'No file uploaded' });

        const ext = path.extname(file.originalname) || '.jpg';
        const dest = `users/cover-photos/user_${req.user.id}_${Date.now()}${ext}`;
        const url = await uploadToGCS(file.buffer, file.mimetype, dest);

        const cur = await db('users')
            .select('cover_url')
            .where({ id: req.user.id })
            .first();
        await deleteFromGCSByUrl(cur?.cover_url);

        await db('users')
            .where({ id: req.user.id })
            .update({ cover_url: url, updated_at: db.fn.now() });

        const u = await db('users')
            .select(
                'id',
                'public_id',
                'handle',
                'first_name',
                'last_name',
                'avatar_url',
                'profile_picture',
                'cover_url',
                'privacy_json',
                'updated_at'
            )
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
        const cur = await db('users')
            .select('cover_url')
            .where({ id: req.user.id })
            .first();
        await deleteFromGCSByUrl(cur?.cover_url);
        await db('users')
            .where({ id: req.user.id })
            .update({ cover_url: null, updated_at: db.fn.now() });
        return res.sendStatus(204);
    } catch (err) {
        next(err);
    }
});

/* ===================== PROFILE PHOTOS (NEW) ================================ */

// list photos for a user
router.get('/photos/:handleOrId', async (req, res, next) => {
    try {
        const { handleOrId } = req.params;
        let u = await db('users')
            .select('id')
            .whereRaw('LOWER(handle)=LOWER(?)', [handleOrId])
            .first();
        if (!u && /^\d+$/.test(handleOrId)) {
            u =
                (await db('users').select('id').where({ public_id: Number(handleOrId) }).first()) ||
                (await db('users').select('id').where({ id: Number(handleOrId) }).first());
        }
        if (!u) return res.status(404).json({ message: 'User not found' });

        const items = await db('user_profile_photos')
            .where({ user_id: u.id })
            .orderBy('created_at', 'desc')
            .limit(20);

        res.json({ photos: items });
    } catch (err) {
        next(err);
    }
});

// upload photos (owner only)
router.post('/photos', authenticateToken, upload.array('photos', 20), async (req, res, next) => {
    try {
        const currentCount = await db('user_profile_photos')
            .where({ user_id: req.user.id })
            .count({ c: '*' })
            .first();
        const remaining = 20 - Number(currentCount?.c || 0);
        if (remaining <= 0)
            return res.status(400).json({ message: 'You already have 20 photos.' });

        const files = (req.files || []).slice(0, remaining);
        if (files.length === 0)
            return res.status(400).json({ message: 'No photos to upload.' });

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

        const all = await db('user_profile_photos')
            .where({ user_id: req.user.id })
            .orderBy('created_at', 'desc')
            .limit(20);
        res.json({ photos: all });
    } catch (err) {
        next(err);
    }
});

// delete a photo (owner only)
router.delete('/photos/:photoId', authenticateToken, async (req, res, next) => {
    try {
        const photo = await db('user_profile_photos')
            .where({ id: Number(req.params.photoId) })
            .first();
        if (!photo) return res.status(404).json({ message: 'Photo not found' });
        if (photo.user_id !== req.user.id)
            return res.status(403).json({ message: 'Not allowed' });

        await deleteFromGCSByUrl(photo.url);
        await db('user_photo_likes').where({ photo_id: photo.id }).del();
        await db('user_photo_comments').where({ photo_id: photo.id }).del();
        await db('user_profile_photos').where({ id: photo.id }).del();

        const all = await db('user_profile_photos')
            .where({ user_id: req.user.id })
            .orderBy('created_at', 'desc')
            .limit(20);
        res.json({ photos: all });
    } catch (err) {
        next(err);
    }
});

// like toggle
router.post('/photos/:photoId/like', authenticateToken, async (req, res, next) => {
    try {
        const pid = Number(req.params.photoId);
        const row = await db('user_photo_likes')
            .where({ photo_id: pid, user_id: req.user.id })
            .first();
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
        const pid = Number(req.params.photoId);
        const rows = await db('user_photo_comments as c')
            .join('users as u', 'c.user_id', 'u.id')
            .select(
                'c.id',
                'c.photo_id',
                'c.user_id',
                'c.content',
                'c.created_at',
                'u.first_name',
                'u.last_name',
                'u.avatar_url',
                'u.profile_picture'
            )
            .where('c.photo_id', pid)
            .orderBy('c.created_at', 'desc')
            .limit(200);
        res.json(rows);
    } catch (err) {
        next(err);
    }
});
router.post(
    '/photos/:photoId/comments',
    authenticateToken,
    async (req, res, next) => {
        try {
            const pid = Number(req.params.photoId);
            const content = String(req.body.content || '').slice(0, 1000);
            if (!content) return res.status(400).json({ errors: [{ msg: 'Content required' }] });
            const [id] = await db('user_photo_comments').insert({
                photo_id: pid,
                user_id: req.user.id,
                content,
            });
            const c = await db('user_photo_comments as c')
                .join('users as u', 'c.user_id', 'u.id')
                .select(
                    'c.id',
                    'c.photo_id',
                    'c.user_id',
                    'c.content',
                    'c.created_at',
                    'u.first_name',
                    'u.last_name',
                    'u.avatar_url',
                    'u.profile_picture'
                )
                .where('c.id', id)
                .first();
            res.json(c);
        } catch (err) {
            next(err);
        }
    }
);

/* --------------------------- USER SEARCH (share) --------------------------- */
router.get('/search', async (req, res, next) => {
    try {
        const { q = '', county = '', city = '' } = req.query;
        const qb = db('users')
            .select(
                'id',
                'public_id',
                'handle',
                'first_name',
                'last_name',
                'avatar_url',
                'profile_picture',
                'home_city',
                'home_county'
            )
            .limit(60)
            .orderBy('first_name', 'asc');
        if (q)
            qb.whereRaw(
                "LOWER(CONCAT_WS(' ', first_name, last_name, handle)) LIKE ?",
                [`%${String(q).toLowerCase()}%`]
            );
        if (county)
            qb.andWhereRaw('LOWER(home_county) = LOWER(?)', [String(county)]);
        if (city) qb.andWhereRaw('LOWER(home_city) = LOWER(?)', [String(city)]);
        const rows = await qb;
        res.json(rows.map(toPublicUser));
    } catch (err) {
        next(err);
    }
});

export default router;
