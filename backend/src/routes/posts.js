// backend/src/routes/posts.js
// ----------------------------------------------------------------------------
//  • Toggle “like” on any post table using (category, post_id, user_id)
//  • Defaults to "community_post" to stay backward-compatible
// ----------------------------------------------------------------------------

import express            from 'express';
import db                 from '../config/db.js';
import authenticateToken  from '../middleware/auth.js';

const router = express.Router();

/* ------------------------------------------------------------------------- */
/*  POST /api/posts/:postId/like                                              */
/*  body|query: { category?: 'community_post' | 'lost_and_found' | 'job' … }  */
/* ------------------------------------------------------------------------- */
router.post('/:postId/like', authenticateToken, async (req, res, next) => {
    const { id: user_id } = req.user;
    const post_id  = parseInt(req.params.postId, 10);
    const category = (req.body.category || 'community_post').trim();

    try {
        await db('post_likes').insert({ category, post_id, user_id });
        return res.json({ liked: true });
    } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY' && err.code !== '23505') {
            console.error('LIKE insert failed:', err);   // ← add this
            return next(err);                            // bubble real error
        }
        await db('post_likes').where({ category, post_id, user_id }).del();
        return res.json({ liked: false });
    }
});

/* ------------------------------------------------------------------------- */
/*  POST /api/posts/:postId/comments   – unchanged                            */
/* ------------------------------------------------------------------------- */
router.post('/:postId/comments', authenticateToken, async (req, res, next) => {
    const userId  = req.user.id;
    const postId  = parseInt(req.params.postId, 10);
    const { content, parent_id = null } = req.body;

    try {
        const [commentId] = await db('post_comments').insert({
            post_id:  postId,
            user_id:  userId,
            content,
            parent_id
        });

        const comment = await db('post_comments')
            .where('id', commentId)
            .first();

        res.status(201).json(comment);
    } catch (err) { next(err); }
});

/* ------------------------------------------------------------------------- */
/*  GET /api/posts/:postId/comments                                           */
/* ------------------------------------------------------------------------- */
router.get('/:postId/comments', async (req, res, next) => {
    const postId = parseInt(req.params.postId, 10);

    try {
        const comments = await db('post_comments as pc')
            .join('users as u', 'pc.user_id', 'u.id')
            .select(
                'pc.id',
                'pc.content',
                'pc.created_at',
                'u.first_name',
                'u.last_name',
                'u.avatar_url'
            )
            .where('pc.post_id', postId)
            .orderBy('pc.created_at', 'asc');

        res.json(comments);
    } catch (err) { next(err); }
});

export default router;
