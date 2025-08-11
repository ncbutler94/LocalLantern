// backend/src/routes/posts.js
// =============================================================================
// POST likes + threaded comments + comment‑likes + comment‑image upload (GCS)
// -----------------------------------------------------------------------------
//
// Requires (install once in backend):
//   npm i multer @google-cloud/storage
//
// Env:
//   GCP_PROJECT_ID=<your project id>
//   GCS_BUCKET=<your bucket name>   // same bucket you use for post photos
//
// DB (run a migration once if not present):
//   comment_photos: id, comment_id(FK post_comments.id), url, position
//   (DDL shown at bottom of file)
//
// =============================================================================

import express           from 'express';
import path              from 'path';
import multer            from 'multer';
import { Storage }       from '@google-cloud/storage';
import db                from '../config/db.js';
import authenticateToken from '../middleware/auth.js';
import optionalAuth      from '../middleware/optionalAuth.js';

const router = express.Router();

/* ── Multer: keep in memory; 5 MB limit ─────────────────────────────────── */
const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: 5 * 1024 * 1024 },
});

/* ── Google Cloud Storage setup ─────────────────────────────────────────── */
const storage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket  = storage.bucket(process.env.GCS_BUCKET);
const COMMENT_PHOTO_DIR = 'comment_photos';

async function uploadCommentImage(file) {
    const ext     = path.extname(file.originalname) || '';
    const key     = `${COMMENT_PHOTO_DIR}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
    const blob    = bucket.file(key);
    const stream  = blob.createWriteStream({ metadata: { contentType: file.mimetype } });

    await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(file.buffer);
    });

    return `https://storage.googleapis.com/${bucket.name}/${key}`;
}

/* ────────────────────────────────────────────────────────────────
 * 1) POST /api/posts/:postId/like  (unchanged)
 * ──────────────────────────────────────────────────────────────── */
router.post('/:postId/like', authenticateToken, async (req, res, next) => {
    const { id: user_id } = req.user;
    const post_id  = Number(req.params.postId);
    const category = (req.body.category || req.query.category || 'community_post').trim();

    try {
        const existing = await db('post_likes').where({ category, post_id, user_id }).first();

        if (existing) {
            await db('post_likes').where({ id: existing.id }).del();
        } else {
            await db('post_likes').insert({ category, post_id, user_id });
        }

        const [{ count }] = await db('post_likes')
            .where({ category, post_id })
            .count('* as count');

        return res.json({ liked: !existing, likesCount: Number(count) || 0 });
    } catch (err) {
        return next(err);
    }
});

/* ────────────────────────────────────────────────────────────────
 * 2) POST /api/posts/comments/:commentId/like  (toggle)
 * ──────────────────────────────────────────────────────────────── */
router.post('/comments/:commentId/like', authenticateToken, async (req, res, next) => {
    const { id: user_id } = req.user;
    const comment_id      = Number(req.params.commentId);

    try {
        const existing = await db('comment_likes').where({ comment_id, user_id }).first();

        if (existing) {
            await db('comment_likes').where({ id: existing.id }).del();
        } else {
            await db('comment_likes').insert({ comment_id, user_id });
        }

        const [{ count }] = await db('comment_likes').where({ comment_id }).count('* as count');

        return res.json({ liked: !existing, likesCount: Number(count) || 0 });
    } catch (err) {
        return next(err);
    }
});

/* ────────────────────────────────────────────────────────────────
 * 3) POST /api/posts/:postId/comments   (now accepts image)
 *    Accepts JSON or multipart/form-data:
 *      - fields: content, parent_id?, category?
 *      - file:   image?  (1 image)
 * ──────────────────────────────────────────────────────────────── */
router.post(
    '/:postId/comments',
    authenticateToken,
    upload.single('image'),                // ← NEW: handle optional image
    async (req, res, next) => {
        const { id: user_id } = req.user;
        const post_id  = Number(req.params.postId);

        // body may be JSON or multipart; normalize here
        const content   = (req.body?.content ?? '').toString();
        const parent_id = req.body?.parent_id ? Number(req.body.parent_id) : null;
        const category  = (req.body?.category || 'community_post').trim();

        if (!content.trim() && !req.file) {
            return res.status(400).json({ error: 'empty_content' });
        }

        try {
            const result = await db.transaction(async (trx) => {
                let root_id = null;

                if (parent_id) {
                    const parent = await trx('post_comments')
                        .select('id', 'root_id')
                        .where({ id: parent_id })
                        .first();
                    if (!parent) throw new Error('parent_not_found');
                    root_id = parent.root_id || parent.id;
                    await trx('post_comments').where({ id: parent_id }).increment('reply_count', 1);
                }

                // 1) insert comment
                const insertRes = await trx('post_comments').insert({
                    category,
                    post_id,
                    user_id,
                    content: content.trim(),
                    parent_id,
                    root_id,
                    created_at: trx.fn.now(),
                });

                const comment_id =
                    typeof insertRes[0] === 'object' ? insertRes[0].id : insertRes[0];

                // 2) if an image came in, push to GCS and write comment_photos row
                let imageUrl = null;
                if (req.file) {
                    imageUrl = await uploadCommentImage(req.file);
                    await trx('comment_photos').insert({ comment_id, url: imageUrl, position: 0 });
                }

                // 3) hydrate + include initial like flags and image
                const row = await trx('post_comments as pc')
                    .join('users as u', 'pc.user_id', 'u.id')
                    .select(
                        'pc.id',
                        'pc.post_id',
                        'pc.parent_id',
                        'pc.root_id',
                        'pc.reply_count',
                        'pc.content',
                        'pc.created_at',
                        'u.first_name',
                        'u.last_name',
                        'u.avatar_url',
                        trx.raw('0 AS likesCount'),
                        trx.raw('false AS viewerLiked'),
                        trx.raw('? AS image', [imageUrl]),
                    )
                    .where('pc.id', comment_id)
                    .first();

                return row;
            });

            return res.status(201).json(result);
        } catch (err) {
            if (err.message === 'parent_not_found') {
                return res.status(400).json({ error: 'invalid_parent_id' });
            }
            return next(err);
        }
    }
);

/* ────────────────────────────────────────────────────────────────
 * 4) GET /api/posts/:postId/comments   (popular/newest + image)
 * ──────────────────────────────────────────────────────────────── */
router.get('/:postId/comments', optionalAuth, async (req, res, next) => {
    const post_id  = Number(req.params.postId);
    const category = (req.query.category || 'community_post').trim();
    const sortKey  = (req.query.sort || 'popular').toLowerCase();
    const viewerId = req.user?.id || 0;

    try {
        const rows = await db('post_comments as pc')
            .join('users as u', 'pc.user_id', 'u.id')
            .select(
                'pc.id',
                'pc.post_id',
                'pc.parent_id',
                'pc.root_id',
                'pc.reply_count',
                'pc.content',
                'pc.created_at',
                'u.first_name',
                'u.last_name',
                'u.avatar_url',
                // like counts & viewer-liked flag
                db.raw('(SELECT COUNT(*) FROM comment_likes WHERE comment_id = pc.id) AS likesCount'),
                db.raw(
                    'EXISTS (SELECT 1 FROM comment_likes WHERE comment_id = pc.id AND user_id = ?) AS viewerLiked',
                    [viewerId]
                ),
                // single image url (if present)
                db.raw(
                    '(SELECT url FROM comment_photos WHERE comment_id = pc.id ORDER BY position ASC, id ASC LIMIT 1) AS image'
                ),
            )
            .where({ 'pc.post_id': post_id, 'pc.category': category })
            .modify((q) => {
                if (sortKey === 'newest') {
                    q.orderBy('pc.created_at', 'desc');
                } else {
                    q.orderBy('likesCount', 'desc').orderBy('pc.created_at', 'desc');
                }
            });

        return res.json(rows);
    } catch (err) {
        return next(err);
    }
});

export default router;

/* ---------------------------------------------------------------------------
   Knex migration (create once if not already present)

   // 20250808_add_comment_photos.js  (CJS or ESM style as used in your project)
   exports.up = (knex) =>
     knex.schema.createTable('comment_photos', (t) => {
       t.increments('id').primary();
       t.integer('comment_id').unsigned().notNullable()
         .references('id').inTable('post_comments').onDelete('CASCADE');
       t.string('url', 600).notNullable();
       t.integer('position').defaultTo(0);
     });

   exports.down = (knex) => knex.schema.dropTableIfExists('comment_photos');
--------------------------------------------------------------------------- */
