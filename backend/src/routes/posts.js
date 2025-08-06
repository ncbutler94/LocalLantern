// backend/src/routes/posts.js
// =============================================================================
// POST likes + threaded comments + NEW comment-likes & popular sorting
// -----------------------------------------------------------------------------

import express           from 'express';
import db                from '../config/db.js';
import authenticateToken from '../middleware/auth.js';
import optionalAuth      from '../middleware/optionalAuth.js';

const router = express.Router();

/* ────────────────────────────────────────────────────────────────
 * 1) POST /api/posts/:postId/like  (unchanged)
 * ──────────────────────────────────────────────────────────────── */
router.post('/:postId/like', authenticateToken, async (req, res, next) => {
    const { id: user_id } = req.user;
    const post_id  = Number(req.params.postId);
    const category = (req.body.category || req.query.category || 'community_post').trim();

    try {
        const existing = await db('post_likes')
            .where({ category, post_id, user_id })
            .first();

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
 * 2) NEW – POST /api/posts/comments/:commentId/like  (toggle)
 * ──────────────────────────────────────────────────────────────── */
router.post('/comments/:commentId/like', authenticateToken, async (req, res, next) => {
    const { id: user_id }  = req.user;
    const comment_id       = Number(req.params.commentId);

    try {
        const existing = await db('comment_likes')
            .where({ comment_id, user_id })
            .first();

        if (existing) {
            await db('comment_likes').where({ id: existing.id }).del();
        } else {
            await db('comment_likes').insert({ comment_id, user_id });
        }

        const [{ count }] = await db('comment_likes')
            .where({ comment_id })
            .count('* as count');

        return res.json({ liked: !existing, likesCount: Number(count) || 0 });
    } catch (err) {
        return next(err);
    }
});

/* ────────────────────────────────────────────────────────────────
 * 3) POST /api/posts/:postId/comments   (unchanged)
 * ──────────────────────────────────────────────────────────────── */
router.post('/:postId/comments', authenticateToken, async (req, res, next) => {
    const { id: user_id } = req.user;
    const post_id = Number(req.params.postId);
    const {
        content   = '',
        parent_id = null,
        category: bodyCategory,
    } = req.body;

    if (!content.trim()) return res.status(400).json({ error: 'empty_content' });
    const category = (bodyCategory || 'community_post').trim();

    try {
        const newComment = await db.transaction(async (trx) => {
            let root_id = null;

            /* ── validate parent & bump reply_count ── */
            if (parent_id) {
                const parent = await trx('post_comments')
                    .select('id', 'root_id')
                    .where({ id: parent_id })
                    .first();

                if (!parent) throw new Error('parent_not_found');

                root_id = parent.root_id || parent.id;

                await trx('post_comments')
                    .where({ id: parent_id })
                    .increment('reply_count', 1);
            }

            /* ── insert comment ── */
            const insertRes = await trx('post_comments').insert({
                category,
                post_id,
                user_id,
                content: content.trim(),
                parent_id,
                root_id,
                created_at: trx.fn.now(),
            });

            const insertedId =
                typeof insertRes[0] === 'object' ? insertRes[0].id : insertRes[0];

            /* ── hydrate row with author data ── */
            return await trx('post_comments as pc')
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
                    db.raw('0 AS likesCount'),
                    db.raw('false AS viewerLiked'),
                )
                .where('pc.id', insertedId)
                .first();
        });

        return res.status(201).json(newComment);
    } catch (err) {
        if (err.message === 'parent_not_found') {
            return res.status(400).json({ error: 'invalid_parent_id' });
        }
        return next(err);
    }
});

/* ────────────────────────────────────────────────────────────────
 * 4) GET /api/posts/:postId/comments   (★ enhanced)
 *    ?sort=popular|newest   – default popular
 * ──────────────────────────────────────────────────────────────── */
router.get('/:postId/comments', optionalAuth, async (req, res, next) => {
    const post_id  = Number(req.params.postId);
    const category = (req.query.category || 'community_post').trim();
    const sortKey  = (req.query.sort || 'popular').toLowerCase();

    const viewerId = req.user?.id || 0; // 0 → never matches EXISTS()

    try {
        const q = db('post_comments as pc')
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
                /* like counts & viewer-liked flag */
                db.raw(
                    '(SELECT COUNT(*) FROM comment_likes WHERE comment_id = pc.id) AS likesCount',
                ),
                db.raw(
                    'EXISTS (SELECT 1 FROM comment_likes WHERE comment_id = pc.id AND user_id = ?) AS viewerLiked',
                    [viewerId],
                ),
            )
            .where({ 'pc.post_id': post_id, 'pc.category': category });

        if (sortKey === 'newest') {
            q.orderBy('pc.created_at', 'desc');
        } else {
            // popular (default) – likes desc, then newest
            q.orderBy('likesCount', 'desc').orderBy('pc.created_at', 'desc');
        }

        const rows = await q;
        return res.json(rows);
    } catch (err) {
        return next(err);
    }
});

export default router;
