// backend/src/routes/community/community.js
/* ---------------------------------------------------------------------------
 * Community feed — counts likes and flags viewer‑liked rows.
 * Added 2025‑07‑19: joins for recommendations & volunteer‑help tables
 * Added 2025‑08‑04: pagination (?limit=&offset=)
 * Added 2025‑10‑20: repost counts + viewerReposted            ← NEW
 * ------------------------------------------------------------------------- */

import express           from 'express';
import db                from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';
import optionalAuth      from '../../middleware/optionalAuth.js';

const router = express.Router();

/* Helpers */
const normalizeCounty = (s = '') => s.replace(/ County$/i, '').trim();

/* Pagination defaults / hard limits */
const DEFAULT_LIMIT = 30;
const MAX_LIMIT     = 100;

/* GET /api/community ------------------------------------------------------- */
router.get('/', optionalAuth, async (req, res, next) => {
    try {
        const {
            search = '',
            subtype = '',
            sort = 'newest',
            dateRange = 'all',
            city = '',
            county = '',
            limit:  limitQ  = DEFAULT_LIMIT,
            offset: offsetQ = 0,
        } = req.query;

        const limit  = Math.max(1, Math.min(Number(limitQ)  || DEFAULT_LIMIT, MAX_LIMIT));
        const offset = Math.max(0, Number(offsetQ) || 0);

        const userId = req.user?.id || 0; // 0 → never matches EXISTS()

        let q = db('community_posts as cp')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_categories as cc',  'cp.category', 'cc.slug')
            .leftJoin('lost_and_found as lf',        'cp.id', 'lf.id')
            .leftJoin('announcements as a',          'cp.id', 'a.id')
            .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
            .leftJoin('community_photos as p',       'cp.id', 'p.post_id')
            .leftJoin('recommendations_and_tips as rt',  'cp.id', 'rt.id')
            .leftJoin('volunteer_help_requests as vh',   'cp.id', 'vh.id');

        if (subtype) q.where('cp.category', subtype.trim());

        if (search.trim()) {
            const stopWords = new Set(['the','for','an','a','and','of','to','in','on']);
            const words = search
                .trim().toLowerCase().split(/\s+/)
                .filter((w) => w && !stopWords.has(w));

            if (words.length) {
                q.andWhere(function () {
                    words.forEach((w, i) => {
                        this[i ? 'orWhere' : 'where'](function () {
                            this.where('cp.title', 'like', `%${w}%`)
                                .orWhere('cp.description', 'like', `%${w}%`)
                                .orWhere('u.first_name', 'like', `%${w}%`)
                                .orWhere('u.last_name',  'like', `%${w}%`);
                        });
                    });
                });
            }
        }

        if (city.trim())   q.whereRaw('LOWER(cp.city)   = ?', city.trim().toLowerCase());
        if (county.trim()) q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());

        const select = [
            'cp.id',
            'cp.category',
            'cp.posted_at as date_created',
            'cp.latitude',
            'cp.longitude',
            db.raw('COALESCE(cp.title, "")        AS title'),
            db.raw('COALESCE(cp.description, "")  AS description'),
            db.raw('COALESCE(cp.city, "")         AS city'),
            db.raw('COALESCE(cp.county, "")       AS county'),
            db.raw('COALESCE(cp.street_address, "") AS street_address'),

            'u.first_name',
            'u.last_name',
            'u.avatar_url',
            db.raw('cc.label AS categoryLabel'),
            'lf.lost_or_found',
            'lf.reward',
            'vh.help_type',
            'vh.needed_date',
            'vh.contact',
            db.raw('MAX(rt.rec_type) AS rec_type'),

            // photos aggregated
            db.raw('JSON_ARRAYAGG(p.url) AS photos'),

            // likes
            db('post_likes')
                .count('*')
                .whereRaw('category = ? AND post_id = cp.id', ['community_post'])
                .as('likesCount'),
            db.raw(
                'EXISTS (SELECT 1 FROM post_likes WHERE category = ? AND post_id = cp.id AND user_id = ?) AS viewerLiked',
                ['community_post', userId],
            ),

            // ── reposts (NEW)
            db('post_reposts')
                .count('*')
                .whereRaw('post_id = cp.id')
                .as('repostsCount'),
            db.raw(
                'EXISTS (SELECT 1 FROM post_reposts WHERE post_id = cp.id AND user_id = ?) AS viewerReposted',
                [userId],
            ),
        ];

        q.groupBy('cp.id');

        if (sort === 'popular') {
            q.orderBy('likesCount', 'desc').orderBy('cp.posted_at', 'desc');
        } else {
            q.orderBy('cp.posted_at', 'desc');
        }

        const posts = await q.limit(limit).offset(offset).select(select);
        return res.json(posts);
    } catch (err) {
        return next(err);
    }
});

/* (rest of file unchanged: create post, categories) */
router.post('/', authenticateToken, async (req, res, next) => {
    try {
        const { category, latitude, longitude } = req.body;

        const [id] = await db('community_posts').insert({
            category,
            user_id:      req.user.id,
            date_created: db.fn.now(),
            posted_at:    db.fn.now(),
            latitude:     latitude  ? parseFloat(latitude)  : null,
            longitude:    longitude ? parseFloat(longitude) : null,
        });

        return res.status(201).json({ id });
    } catch (err) {
        return next(err);
    }
});

router.get('/categories', async (_req, res, next) => {
    try {
        const rows = await db('community_categories')
            .select('slug as id', 'label')
            .orderBy('label');
        return res.json(rows);
    } catch (err) {
        return next(err);
    }
});

export default router;
