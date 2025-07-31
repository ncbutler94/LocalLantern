// backend/src/routes/posts.js
// ----------------------------------------------------------------------------
//  Generic helpers for “likes” and “comments” that work across any post table.
//  Each record carries a `category` so we know which post table the id belongs
//  to.  We default to `"community_post"` to stay backward-compatible.
// ----------------------------------------------------------------------------

import express           from 'express';
import db                from '../config/db.js';
import authenticateToken from '../middleware/auth.js';
import optionalAuth      from '../middleware/optionalAuth.js';

const router = express.Router();

/* ────────────────────────────────────────────────────────────
 * POST /api/posts/:postId/like
 * body|query: { category?: 'community_post' | 'lost_and_found' | 'job' … }
 * Toggles the like: insert → like, dup-key → delete → unlike.
 * ──────────────────────────────────────────────────────────── */
router.post('/:postId/like', authenticateToken, async (req, res, next) => {
    const { id: user_id } = req.user;
    const post_id  = Number(req.params.postId);
    const category = (req.body.category || req.query.category || 'community_post').trim();

    try {
        await db('post_likes').insert({ category, post_id, user_id });
        return res.json({ liked: true });
    } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY' && err.code !== '23505') return next(err);
        await db('post_likes').where({ category, post_id, user_id }).del();
        return res.json({ liked: false });
    }
});

/* ────────────────────────────────────────────────────────────
 * POST /api/posts/:postId/comments
 * body: { content, parent_id?, category? }
 * Requires login; refuses empty comments.
 * ──────────────────────────────────────────────────────────── */
router.post('/:postId/comments', authenticateToken, async (req, res, next) => {
    const { id: user_id } = req.user;
    const post_id   = Number(req.params.postId);
    const {
        content   = '',
        parent_id = null,
        category: bodyCategory,
    } = req.body;

    if (!content.trim()) return res.status(400).json({ error: 'empty_content' });

    const category = (bodyCategory || 'community_post').trim();

    try {
        const [id] = await db('post_comments').insert({
            category,
            post_id,
            user_id,
            content: content.trim(),
            parent_id,
        });

        const comment = await db('post_comments as pc')
            .join('users as u', 'pc.user_id', 'u.id')
            .select(
                'pc.id',
                'pc.content',
                'pc.created_at',
                'u.first_name',
                'u.last_name',
                'u.avatar_url',
            )
            .where('pc.id', id)
            .first();

        return res.status(201).json(comment);
    } catch (err) {
        return next(err);
    }
});

/* ────────────────────────────────────────────────────────────
 * GET /api/posts/:postId/comments
 * query: { category? }  – defaults to community_post
 * Public endpoint (viewer may be logged-out).
 * ──────────────────────────────────────────────────────────── */
router.get('/:postId/comments', optionalAuth, async (req, res, next) => {
    const post_id  = Number(req.params.postId);
    const category = (req.query.category || 'community_post').trim();

    try {
        const rows = await db('post_comments as pc')
            .join('users as u', 'pc.user_id', 'u.id')
            .select(
                'pc.id',
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

export default router;
