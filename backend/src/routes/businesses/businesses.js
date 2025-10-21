// backend/src/routes/businesses/businesses.js
// Public reads must work for logged-out viewers. Owner actions still require auth.

import express from 'express';
import crypto from 'crypto';
import path from 'path';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { Storage } from '@google-cloud/storage';
import knex from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ───────────────── optional auth (NO 403 on bad/expired token) ───────────────── */
function optionalAuth(req, _res, next) {
    const token =
        (req.cookies && req.cookies.token) ||
        (req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.slice(7)
            : null);

    if (!token) return next();
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        req.user = null; // behave as logged-out
    }
    return next();
}

/* ───────────────── optional GCS (comment images) ───────────────── */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const GCS_BUCKET = process.env.GCS_BUCKET || '';
const storage = GCS_BUCKET ? new Storage({ projectId: process.env.GCP_PROJECT_ID }) : null;
const bucket = storage && GCS_BUCKET ? storage.bucket(GCS_BUCKET) : null;

async function uploadCommentImage(file, businessId, mediaId) {
    if (!bucket || !file) return null;
    const ext = path.extname(file.originalname || '') || '.jpg';
    const key = `businesses/comment_photos/${businessId}/${mediaId}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}${ext}`;
    const blob = bucket.file(key);
    const stream = blob.createWriteStream({ metadata: { contentType: file.mimetype } });
    await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(file.buffer);
    });
    return `https://storage.googleapis.com/${bucket.name}/${key}`;
}

/* ───────────────── helpers ───────────────── */
async function makeSlug(name) {
    const base =
        String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'business';
    let slug = base, i = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await knex('businesses').where({ slug }).first()) slug = `${base}-${i++}`;
    return slug;
}

/* ============== LIST ============== */
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

        if (sort === 'popular') q.orderBy('verified', 'desc').orderBy('created_at', 'desc');
        else q.orderBy('created_at', 'desc');

        const rows = await q;
        res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses] error:', err);
        res.status(500).json({ error: 'server_error' });
    }
});

/* ============== DETAIL ============== */
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const viewerId = Number(req.user?.id || 0);

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

        const parse = (t) => { try { return typeof t === 'string' ? JSON.parse(t) : t; } catch { return null; } };
        const viewerIsOwner = viewerId
            ? !!(await knex('business_owners').where({ business_id: id, user_id: viewerId }).first())
            : false;

        return res.json({
            ...b,
            hours_json: parse(b.hours_json) || null,
            amenities_json: parse(b.amenities_json) || null,
            gallery_urls: parse(b.gallery_urls) || [],
            viewer_is_owner: viewerIsOwner,
        });
    } catch (err) {
        console.error('[GET /api/businesses/:id] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/* ============== CREATE (simple) ============== */
router.post('/', async (req, res) => {
    try {
        const {
            name, category, description, contact_email, phone, website,
            street_address, city, county, latitude, longitude,
            logo_url, cover_url, long_description = null,
            hours_json = null, amenities_json = null, price_range = null,
        } = req.body || {};

        if (!name || !category || !contact_email) return res.status(400).json({ error: 'Missing required fields' });

        const slug = await makeSlug(name);
        const payload = {
            name, slug, category, description: description || '', long_description,
            contact_email, phone: phone || null, website: website || null,
            street_address: street_address || null, city: city || null, county: county || null,
            latitude: latitude ?? null, longitude: longitude ?? null,
            hours_json: hours_json ? JSON.stringify(hours_json) : null,
            amenities_json: amenities_json ? JSON.stringify(amenities_json) : null,
            price_range,
            logo_url: logo_url || null, cover_url: cover_url || null,
            verified: 0, status: 'pending',
        };

        let insertedId;
        try {
            const ret = await knex('businesses').insert(payload).returning(['id']);
            insertedId = Array.isArray(ret) ? (typeof ret[0] === 'object' ? ret[0].id : ret[0]) : ret;
        } catch {
            const ret = await knex('businesses').insert(payload);
            insertedId = Array.isArray(ret) ? ret[0] : ret;
        }

        const business = await knex('businesses').where({ id: insertedId }).first();
        return res.json({ ok: true, business });
    } catch (err) {
        console.error('[POST /api/businesses] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/* ============== REVIEWS ============== */
router.post('/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        const userId = req.user?.id;
        const { rating, comment = '' } = req.body || {};
        if (!userId) return res.status(401).json({ ok: false, error: 'unauthorized' });

        const num = Number(rating);
        if (!(num >= 0.5 && num <= 5 && Math.abs(num * 2 - Math.round(num * 2)) < 1e-9))
            return res.status(400).json({ ok: false, error: 'Rating must be 0.5–5.0' });
        const half = Math.round(num * 2);

        await knex('business_reviews')
            .insert({ business_id: businessId, user_id: userId, rating_half_stars: half, comment })
            .onConflict(['business_id', 'user_id'])
            .merge({ rating_half_stars: half, comment, updated_at: knex.fn.now() });

        return res.json({ ok: true });
    } catch (err) {
        console.error('[POST /api/businesses/:id/reviews] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.get('/:id/reviews', optionalAuth, async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        const viewerId = Number(req.user?.id || 0);

        const rows = await knex('business_reviews as r')
            .select(
                'r.id','r.user_id','r.rating_half_stars','r.comment','r.created_at','r.updated_at',
                knex.raw('r.user_id = ? AS is_me', [viewerId])
            )
            .where({ business_id: businessId })
            .orderBy('created_at', 'desc');

        const ids = rows.map((r) => r.id);
        const replies = ids.length
            ? await knex('business_review_replies').select('*').whereIn('review_id', ids).orderBy('created_at','asc')
            : [];
        const grouped = replies.reduce((acc, r) => { (acc[r.review_id] = acc[r.review_id] || []).push(r); return acc; }, {});
        const items = rows.map((r) => ({ ...r, replies: grouped[r.id] || [] }));
        const meReview = items.find((r) => r.is_me) || null;

        const canReply = viewerId
            ? !!(await knex('business_owners').where({ business_id: businessId, user_id: viewerId }).first())
            : false;

        return res.json({ ok: true, items, can_reply: canReply, me_review: meReview });
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
        await knex('business_reviews').where({ business_id: businessId, user_id: userId }).del();
        return res.json({ ok: true });
    } catch (err) {
        console.error('[DELETE /api/businesses/:id/reviews/me] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* ============== MEDIA (read-only for this UI) ============== */
router.get('/:id/media', async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const rows = await knex('business_media')
            .select('*')
            .where({ business_id })
            .orderBy('sort_order','asc')
            .orderBy('created_at','asc');
        res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses/:id/media] error:', err);
        res.status(500).json({ ok: false, error: 'server_error' });
    }
});

export default router;
