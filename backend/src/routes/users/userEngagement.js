// server/routes/userEngagement.js
// Unified "engagement posts" endpoint for a user: likes + reposts.
// Path:   GET /api/users/:handle/engagement/posts
// Params: :handle  - user handle OR numeric id
// Query : types    - optional csv; any of [likes,reposts] (default: both)
//         limit    - optional int (default 200)
// Returns: { likes: [...], reposts: [...] } with community post cards enriched

const express = require('express');

function createRouter(knex) {
    const router = express.Router();

    // --- schema feature detection (cached) --------------------------------
    let LF_RESOLVE_COLS = undefined; // { hasTable, resolved_at, resolved_message, resolved_by_user_id }

    async function detectLostAndFoundResolveCols() {
        if (LF_RESOLVE_COLS !== undefined) return LF_RESOLVE_COLS;
        try {
            const hasTable = await knex.schema.hasTable('lost_and_found');
            if (!hasTable) {
                LF_RESOLVE_COLS = { hasTable: false, resolved_at: false, resolved_message: false, resolved_by_user_id: false };
                return LF_RESOLVE_COLS;
            }
            const [a, b, c] = await Promise.all([
                knex.schema.hasColumn('lost_and_found', 'resolved_at'),
                knex.schema.hasColumn('lost_and_found', 'resolved_message'),
                knex.schema.hasColumn('lost_and_found', 'resolved_by_user_id'),
            ]);
            LF_RESOLVE_COLS = { hasTable: true, resolved_at: !!a, resolved_message: !!b, resolved_by_user_id: !!c };
            return LF_RESOLVE_COLS;
        } catch {
            LF_RESOLVE_COLS = { hasTable: false, resolved_at: false, resolved_message: false, resolved_by_user_id: false };
            return LF_RESOLVE_COLS;
        }
    }

    // Helper: locate viewer by handle or id
    async function getUserIdByHandleOrId(handleOrId) {
        const row = await knex('users')
            .select('id')
            .where(function whereUser(q) {
                if (String(handleOrId).match(/^\d+$/)) {
                    q.where('id', Number(handleOrId));
                } else {
                    q.where('handle', String(handleOrId));
                }
            })
            .first();
        return row ? row.id : null;
    }

    // Helper: enrich community posts with author, photos, counts, and lost_or_found
    async function hydratePosts(postRows) {
        if (!postRows || postRows.length === 0) return [];

        const postIds = postRows.map((p) => p.id);

        // photos
        const photosRaw = await knex('community_photos')
            .select('post_id', 'url', 'photo_url', 'path', 'position')
            .whereIn('post_id', postIds)
            .orderBy('position', 'asc');

        const photosByPost = {};
        for (const r of photosRaw) {
            const key = r.post_id;
            const url = r.url || r.photo_url || r.path || null;
            if (!url) continue;
            (photosByPost[key] ||= []).push(url);
        }

        // counts
        const likeCounts = await knex('post_likes')
            .select('post_id')
            .count({ c: '*' })
            .whereIn('post_id', postIds)
            .groupBy('post_id');

        const commentCounts = await knex('post_comments')
            .select('post_id')
            .count({ c: '*' })
            .whereIn('post_id', postIds)
            .groupBy('post_id');

        const repostCounts = await knex('post_reposts')
            .select('post_id')
            .count({ c: '*' })
            .whereIn('post_id', postIds)
            .groupBy('post_id');

        const likeMap = Object.fromEntries(likeCounts.map((r) => [r.post_id, Number(r.c)]));
        const commentMap = Object.fromEntries(commentCounts.map((r) => [r.post_id, Number(r.c)]));
        const repostMap = Object.fromEntries(repostCounts.map((r) => [r.post_id, Number(r.c)]));

        // author
        const authorIds = Array.from(new Set(postRows.map((p) => p.user_id)));
        const authors = await knex('users')
            .select('id', 'first_name', 'last_name', 'handle', 'profile_picture')
            .whereIn('id', authorIds);
        const authorMap = Object.fromEntries(
            authors.map((a) => [a.id, a])
        );

        // lost & found state for these posts (+ optional resolution fields)
        const lfCols = await detectLostAndFoundResolveCols();
        let lostMap = {};
        if (lfCols.hasTable) {
            const lfSelect = ['id', 'lost_or_found'];
            if (lfCols.resolved_at) lfSelect.push('resolved_at');
            if (lfCols.resolved_message) lfSelect.push('resolved_message');
            if (lfCols.resolved_by_user_id) lfSelect.push('resolved_by_user_id');
            const lfRows = await knex('lost_and_found').select(lfSelect).whereIn('id', postIds);
            lostMap = Object.fromEntries(lfRows.map((r) => [r.id, r]));
        }

        // format rows for front-end cards
        return postRows.map((p) => {
            const a = authorMap[p.user_id] || {};
            const lof = lostMap[p.id] || null;
            return {
                ...p,
                first_name: a.first_name || '',
                last_name: a.last_name || '',
                handle: a.handle || '',
                avatar_url: a.profile_picture || '',
                date_created: p.date_created || p.created_at || p.posted_at,
                likesCount: likeMap[p.id] || 0,
                commentsCount: commentMap[p.id] || 0,
                repostsCount: repostMap[p.id] || 0,
                photos: photosByPost[p.id] || [],
                lost_or_found: lof ? (lof.lost_or_found || null) : null,
                resolved_at: lof ? (lof.resolved_at || null) : null,
                resolved_message: lof ? (lof.resolved_message || '') : '',
                resolved_by_user_id: lof ? (lof.resolved_by_user_id || null) : null,
                category: p.category || (lof ? 'lost-found' : (p.category || 'post')),
            };
        });
    }

    // GET /api/users/:handle/engagement/posts
    router.get('/users/:handle/engagement/posts', async (req, res) => {
        try {
            const handleOrId = req.params.handle;
            const types = (req.query.types || 'likes,reposts').split(',').map((s) => s.trim());
            const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10) || 200, 1), 500);

            const uid = await getUserIdByHandleOrId(handleOrId);
            if (!uid) return res.status(404).json({ message: 'User not found' });

            const out = { likes: [], reposts: [] };

            if (types.includes('likes')) {
                const likedPostIdsQ = knex('post_likes')
                    .select('post_id')
                    .where('user_id', uid)
                    .orderBy('created_at', 'desc')
                    .limit(limit);

                const likedPosts = await knex('community_posts as p')
                    .select(
                        'p.*',
                        knex.raw('NULL as _join_order')
                    )
                    .whereIn('p.id', likedPostIdsQ);

                out.likes = await hydratePosts(likedPosts);
                // keep ordering
                const likedIdsOrder = (await likedPostIdsQ).map((r) => r.post_id);
                const orderIndex = Object.fromEntries(likedIdsOrder.map((id, i) => [id, i]));
                out.likes.sort((a, b) => (orderIndex[a.id] ?? 0) - (orderIndex[b.id] ?? 0));
            }

            if (types.includes('reposts')) {
                const repostedPostIdsQ = knex('post_reposts')
                    .select('post_id')
                    .where('user_id', uid)
                    .orderBy('created_at', 'desc')
                    .limit(limit);

                const repostedPosts = await knex('community_posts as p')
                    .select(
                        'p.*',
                        knex.raw('NULL as _join_order')
                    )
                    .whereIn('p.id', repostedPostIdsQ);

                out.reposts = await hydratePosts(repostedPosts);
                const repIdsOrder = (await repostedPostIdsQ).map((r) => r.post_id);
                const orderIndex = Object.fromEntries(repIdsOrder.map((id, i) => [id, i]));
                out.reposts.sort((a, b) => (orderIndex[a.id] ?? 0) - (orderIndex[b.id] ?? 0));
            }

            return res.json(out);
        } catch (err) {
            console.error('engagement::error', err);
            return res.status(500).json({ message: 'Failed to load engagement posts' });
        }
    });

    return router;
}

module.exports = createRouter;
