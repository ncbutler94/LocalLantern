// backend/src/routes/businesses/businesses.js
import express from 'express';
import crypto from 'crypto';
import knex from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/** Make a unique, URL-safe slug from a business name */
async function makeSlug(name) {
    const base = String(name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'business';

    let slug = base;
    let i = 2;
    // ensure uniqueness
    // eslint-disable-next-line no-await-in-loop
    while (await knex('businesses').where({ slug }).first()) {
        slug = `${base}-${i++}`;
    }
    return slug;
}

/** GET /api/businesses?search=&city=&county=&category=&sort=newest */
router.get('/', async (req, res) => {
    try {
        const { search = '', city = '', county = '', category = '', sort = 'newest' } = req.query;

        const q = knex('businesses')
            .select('*')
            .modify((qb) => {
                if (county) qb.where('county', county);
                if (city) qb.where('city', city);
                if (category) qb.where('category', category);
                if (search.trim()) {
                    const term = `%${search.trim()}%`;
                    qb.where(function () {
                        this.where('name', 'like', term).orWhere('description', 'like', term);
                    });
                }
            });

        if (sort === 'popular') {
            q.orderBy('verified', 'desc').orderBy('created_at', 'desc');
        } else {
            q.orderBy('created_at', 'desc');
        }

        const rows = await q;
        res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses] error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/** GET /api/businesses/:id — full profile + live rating stats */
router.get('/:id', async (req, res) => {
    try {
        const id = Number(req.params.id);
        const b = await knex('businesses as b')
            .leftJoin(
                knex('business_reviews')
                    .select('business_id')
                    .avg({ avg_rating: knex.raw('rating_half_stars / 2.0') })
                    .count({ review_count: '*' })
                    .groupBy('business_id')
                    .as('r'),
                'b.id',
                'r.business_id'
            )
            .select(
                'b.*',
                knex.raw('COALESCE(r.avg_rating, 0) as avg_rating'),
                knex.raw('COALESCE(r.review_count, 0) as review_count')
            )
            .where('b.id', id)
            .first();

        if (!b) return res.status(404).json({ error: 'not_found' });

        // parse JSON columns if stored as text
        const parseJson = (t) => { try { return typeof t === 'string' ? JSON.parse(t) : t; } catch { return null; } };

        const out = {
            ...b,
            hours_json: parseJson(b.hours_json) || null,
            amenities_json: parseJson(b.amenities_json) || null,
            gallery_urls: parseJson(b.gallery_urls) || [],
        };

        return res.json(out);
    } catch (err) {
        console.error('[GET /api/businesses/:id] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/** GET /api/businesses/:id/locations — fetch all locations for a business */
router.get('/:id/locations', async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const rows = await knex('business_locations')
            .select('*')
            .where({ business_id })
            .orderBy('is_primary', 'desc')
            .orderBy('created_at', 'asc');
        return res.json(rows);
    } catch (err) {
        console.error('[GET /api/businesses/:id/locations] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/** POST /api/businesses/:id/locations — owner/admin adds a location (minimal) */
router.post('/:id/locations', authenticateToken, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const {
            nickname = null,
            street_address = null,
            city = null,
            county = null,
            latitude = null,
            longitude = null,
            phone = null,
            hours_json = null,
            is_primary = 0,
        } = req.body || {};

        const payload = {
            business_id,
            nickname, street_address, city, county, phone,
            latitude: latitude == null ? null : Number(latitude),
            longitude: longitude == null ? null : Number(longitude),
            hours_json: hours_json ? JSON.stringify(hours_json) : null,
            is_primary: is_primary ? 1 : 0,
        };

        const ret = await knex('business_locations').insert(payload).returning(['id']);
        const insertedId = Array.isArray(ret) ? (typeof ret[0] === 'object' ? ret[0].id : ret[0]) : ret;
        const row = await knex('business_locations').where({ id: insertedId }).first();
        return res.json({ ok: true, location: row });
    } catch (err) {
        console.error('[POST /api/businesses/:id/locations] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/** POST /api/businesses — create pending business + claim token */
router.post('/', async (req, res) => {
    try {
        const {
            name,
            category,
            description,
            contact_email,
            phone,
            website,
            street_address,
            city,
            county,
            latitude,
            longitude,
            logo_url,
            cover_url,
        } = req.body || {};

        if (!name || !category || !contact_email) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const slug = await makeSlug(name);

        const payload = {
            name,
            slug,
            category,
            description: description || '',
            contact_email,
            phone: phone || null,
            website: website || null,
            street_address: street_address || null,
            city: city || null,
            county: county || null,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
            logo_url: logo_url || null,
            cover_url: cover_url || null,
            verified: 0,
            status: 'pending',
        };

        // Insert + get ID (works across MySQL/Postgres/SQLite)
        let insertedId;
        try {
            const ret = await knex('businesses').insert(payload).returning(['id']);
            insertedId = Array.isArray(ret)
                ? (typeof ret[0] === 'object' ? ret[0].id : ret[0])
                : ret;
        } catch {
            const ret = await knex('businesses').insert(payload);
            insertedId = Array.isArray(ret) ? ret[0] : ret;
        }

        // issue a claim token (valid 3 days)
        const token = crypto.randomBytes(24).toString('hex');
        const expires_at = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);

        try {
            await knex('business_claims').insert({
                business_id: insertedId,
                email: contact_email,
                token,
                expires_at,
            });
        } catch (_) {}

        const business = await knex('businesses').where({ id: insertedId }).first();
        return res.json({ ok: true, business });
    } catch (err) {
        console.error('[POST /api/businesses] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/* ===========================================================
   Reviews Endpoints (unchanged behavior; single review per user)
   =========================================================== */
router.post('/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        const userId = req.user?.id;
        const { rating, comment = '' } = req.body || {};

        if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

        const num = Number(rating);
        if (!(num >= 0.5 && num <= 5 && Math.abs(num * 2 - Math.round(num * 2)) < 1e-9)) {
            return res.status(400).json({ ok: false, error: 'Rating must be 0.5–5.0 in 0.5 steps' });
        }
        const half = Math.round(num * 2); // 1..10

        await knex('business_reviews')
            .insert({
                business_id: businessId,
                user_id: userId,
                rating_half_stars: half,
                comment,
            })
            .onConflict(['business_id', 'user_id'])
            .merge({ rating_half_stars: half, comment, updated_at: knex.fn.now() });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[POST /api/businesses/:id/reviews] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.get('/:id/reviews', async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        const page = Math.max(1, Number(req.query.page) || 1);
        const pageSize = Math.min(50, Number(req.query.pageSize) || 20);
        const viewerId = Number(req.user?.id || 0);

        const rows = await knex('business_reviews as r')
            .select(
                'r.id', 'r.user_id', 'r.rating_half_stars', 'r.comment', 'r.created_at', 'r.updated_at',
                knex.raw('r.user_id = ? AS is_me', [viewerId]),
            )
            .where({ business_id: businessId })
            .orderBy('created_at', 'desc')
            .offset((page - 1) * pageSize)
            .limit(pageSize);

        return res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses/:id/reviews] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.delete('/:id/reviews/me', authenticateToken, async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

        await knex('business_reviews')
            .where({ business_id: businessId, user_id: userId })
            .del();

        return res.json({ ok: true });
    } catch (err) {
        console.error('[DELETE /api/businesses/:id/reviews/me] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* -----------------------------------------------------------
   Deals
   ----------------------------------------------------------- */
router.get('/:id/deals', async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        const now = knex.fn.now();
        const rows = await knex('business_deals')
            .select('*')
            .where({ business_id: businessId, active: 1 })
            .andWhere(function () {
                this.whereNull('starts_at').orWhere('starts_at', '<=', now);
            })
            .andWhere(function () {
                this.whereNull('ends_at').orWhere('ends_at', '>=', now);
            })
            .orderBy('created_at', 'desc');

        return res.json(rows);
    } catch (err) {
        console.error('[GET /api/businesses/:id/deals] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

export default router;
