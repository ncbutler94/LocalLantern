// backend/src/routes/posts.js
// ----------------------------------------------------------------------------
// Endpoints for likes and threaded comments on ANY post table.
// Each row carries a `category` so multiple post-types can share this router.
// Defaults to "community_post" for backward-compatibility.
// ----------------------------------------------------------------------------

import express           from 'express';
import db                from '../config/db.js';
import authenticateToken from '../middleware/auth.js';
import optionalAuth      from '../middleware/optionalAuth.js';

const router = express.Router();

/* ────────────────────────────────────────────────────────────────
 * POST /api/posts/:postId/like
 * body / query: { category? }
 * Toggles like and returns { liked, likesCount }.
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

        return res.json({
            liked: !existing,
            likesCount: Number(count) || 0,
        });
    } catch (err) {
        return next(err);
    }
});

/* ────────────────────────────────────────────────────────────────
 * POST /api/posts/:postId/comments
 * body: { content, parent_id?, category? }
 * Creates a comment or reply (self-referencing).
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

            /* if reply, verify parent and compute root */
            if (parent_id) {
                const parent = await trx('post_comments')
                    .select('id', 'root_id')
                    .where({ id: parent_id })
                    .first();

                if (!parent) throw new Error('parent_not_found');

                root_id = parent.root_id || parent.id;

                /* increment parent's reply_count */
                await trx('post_comments')
                    .where({ id: parent_id })
                    .increment('reply_count', 1);
            }

            /* insert */
            const [id] = await trx('post_comments').insert({
                category,
                post_id,
                user_id,
                content: content.trim(),
                parent_id,
                root_id,
            });

            /* return full row w/ author */
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
                )
                .where('pc.id', id)
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
 * GET /api/posts/:postId/comments
 * query: { category? }
 * Returns ALL comments (top-level + replies) ordered oldest-first.
 * Each row contains parent_id and reply_count for easy client grouping.
 * ──────────────────────────────────────────────────────────────── */
router.get('/:postId/comments', optionalAuth, async (req, res, next) => {
    const post_id  = Number(req.params.postId);
    const category = (req.query.category || 'community_post').trim();

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
            )
            .where({ 'pc.post_id': post_id, 'pc.category': category })
            .orderBy('pc.created_at', 'asc');

        return res.json(rows);
    } catch (err) {
        return next(err);
    }
});

/* ────────────────────────────────────────────────────────────────
 * GET /api/comments/:commentId/replies
 * Optional lazy-load endpoint – returns direct children only.
 * ──────────────────────────────────────────────────────────────── */
router.get('/comments/:commentId/replies', optionalAuth, async (req, res, next) => {
    const commentId = Number(req.params.commentId);

    try {
        const rows = await db('post_comments as pc')
            .join('users as u', 'pc.user_id', 'u.id')
            .select(
                'pc.id',
                'pc.parent_id',
                'pc.root_id',
                'pc.reply_count',
                'pc.content',
                'pc.created_at',
                'u.first_name',
                'u.last_name',
                'u.avatar_url',
            )
            .where('pc.parent_id', commentId)
            .orderBy('pc.created_at', 'asc');

        return res.json(rows);
    } catch (err) {
        return next(err);
    }
});

export default router;
