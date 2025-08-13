// backend/src/routes/businesses/businesses.js
import express from 'express';
import crypto from 'crypto';
import knex from '../../config/db.js';

const router = express.Router();

/** Make a unique, URL‑safe slug from a business name */
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

        // this table is optional — safe to remove if you don’t use it
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

export default router;
