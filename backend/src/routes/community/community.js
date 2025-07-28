/* ---------------------------------------------------------------------------
 * Community feed — counts likes and flags viewer-liked rows.
 * Added 2025-07-19: join recommendations_and_tips so we can surface `rec_type`
 * Added 2025-07-19: join volunteer_help_requests so Volunteer & Help Requests work
 * ------------------------------------------------------------------------- */

import express           from 'express';
import db                from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';
import optionalAuth      from '../../middleware/optionalAuth.js';

const router = express.Router();

/* Helpers */
const normalizeCounty = s => s.replace(/ County$/i, '').trim();

/* ---------------------------------------------------------------------------
 * GET /api/community
 * ------------------------------------------------------------------------- */
router.get('/', optionalAuth, async (req, res, next) => {
    try {
        const {
            search    = '',
            subtype   = '',
            sort      = 'newest',
            dateRange = 'all',
            city      = '',
            county    = '',
        } = req.query;

        const userId = req.user?.id || 0; // 0 → never matches EXISTS()

        /* ---------- base query ------------------------------------------------ */
        let q = db('community_posts as cp')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_categories as cc',  'cp.category', 'cc.slug')
            .leftJoin('lost_and_found as lf',        'cp.id', 'lf.id')
            .leftJoin('announcements as a',          'cp.id', 'a.id')
            .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
            .leftJoin('community_photos as p',       'cp.id', 'p.post_id')
            // extra detail-tables
            .leftJoin('recommendations_and_tips as rt',  'cp.id', 'rt.id')
            .leftJoin('volunteer_help_requests as vh',   'cp.id', 'vh.id');   // NEW ✅

        if (subtype) q.where('cp.category', subtype.trim());

        /* ---------- search ---------------------------------------------------- */
        if (search.trim()) {
            const stopWords = new Set(['the', 'for', 'an', 'a', 'and', 'of', 'to', 'in', 'on']);
            const words = search.trim().toLowerCase().split(/\s+/).filter(w => w && !stopWords.has(w));

            if (words.length) {
                q.andWhere(function () {
                    words.forEach((w, i) => {
                        this[i ? 'orWhere' : 'where'](function () {
                            this.whereILike('cp.title', `%${w}%`)
                                .orWhereILike('cp.description', `%${w}%`);
                        });
                    });
                });
            } else {
                q.andWhere(function () {
                    this.whereILike('cp.title', `%${search.trim()}%`)
                        .orWhereILike('cp.description', `%${search.trim()}%`);
                });
            }
        }

        /* ---------- geo filters ---------------------------------------------- */
        if (city.trim()) {
            const cityL = city.trim().toLowerCase();
            const cntyL = normalizeCounty(county).toLowerCase();
            q.andWhere(function () {
                this.whereRaw('LOWER(cp.city) = ?', cityL)
                    .orWhereRaw(
                        '(cp.city IS NULL OR cp.city = "") AND LOWER(cp.county) = ?',
                        cntyL,
                    );
            });
        } else if (county.trim()) {
            q.andWhereRaw('LOWER(cp.county) = ?', normalizeCounty(county).toLowerCase());
        }

        /* ---------- date-range ------------------------------------------------ */
        const span = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24 }[dateRange] ?? null;
        if (span) q.andWhere('cp.posted_at', '>=', db.raw('DATE_SUB(NOW(), INTERVAL ? HOUR)', [span]));

        /* ---------- selects --------------------------------------------------- */
        const select = [
            'cp.*',
            'u.first_name',
            'u.last_name',
            'u.avatar_url',
            db.raw('cc.label AS categoryLabel'),
            'lf.lost_or_found',
            'lf.reward',
            'psa.severity',
            'psa.alert_type',
            'psa.alert_type_other',
            // volunteer-specific
            'vh.help_type',
            'vh.needed_date',
            'vh.contact',
            // recommendation / tip badge
            db.raw('MAX(rt.rec_type) AS rec_type'),
            // photos as JSON array
            db.raw('JSON_ARRAYAGG(p.url) AS photos'),
            // like counts & viewer-liked flag
            db('post_likes')
                .count('*')
                .whereRaw('category = ? AND post_id = cp.id', ['community_post'])
                .as('likesCount'),
            db.raw(
                'EXISTS (SELECT 1 FROM post_likes WHERE category = ? AND post_id = cp.id AND user_id = ?) AS viewerLiked',
                ['community_post', userId],
            ),
        ];

        q.groupBy('cp.id');

        /* ---------- sorting --------------------------------------------------- */
        if (sort === 'popular') {
            q.orderBy('likesCount', 'desc').orderBy('cp.posted_at', 'desc');
        } else {
            q.orderBy('cp.posted_at', 'desc');
        }

        const posts = await q.select(select);
        res.json(posts);
    } catch (err) {
        next(err);
    }
});

/* ---------------------------------------------------------------------------
 * POST /api/community – create post (unchanged)
 * ------------------------------------------------------------------------- */
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
        res.status(201).json({ id });
    } catch (err) {
        next(err);
    }
});

/* ---------------------------------------------------------------------------
 * GET /api/community/categories – dropdown list (unchanged)
 * ------------------------------------------------------------------------- */
router.get('/categories', async (_req, res, next) => {
    try {
        const rows = await db('community_categories')
            .select('slug as id', 'label')
            .orderBy('label');
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

export default router;
