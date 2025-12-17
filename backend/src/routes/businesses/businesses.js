// backend/src/routes/businesses/businesses.js
// Public reads; owner-only writes. Media likes/comments + reviews + deals + posts + follows.

import express from 'express';
import path from 'path';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import { Storage } from '@google-cloud/storage';
import knex from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ────────────── optional auth (works without cookie-parser) ────────────── */
function optionalAuth(req, _res, next) {
    let token = null;
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) token = auth.slice(7);
    if (!token && typeof req.headers.cookie === 'string') {
        const m = req.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
        if (m) token = decodeURIComponent(m[1]);
    }
    if (token) {
        try {
            req.user = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            req.user = null;
        }
    }
    return next();
}

/* ────────────── GCS (for optional comment images) ────────────── */
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

/* ────────────── helpers ────────────── */
async function isOwner(userId, businessId) {
    if (!userId) return false;
    const row = await knex('business_owners').where({ business_id: businessId, user_id: userId }).first();
    return !!row;
}
function safeJSON(v, fallback = null) {
    try {
        if (v == null) return fallback;
        if (typeof v === 'string') return JSON.parse(v);
        if (typeof v === 'object') return v;
        return fallback;
    } catch {
        return fallback;
    }
}
async function makeSlug(name) {
    const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'business';
    let slug = base; let i = 2;
    // eslint-disable-next-line no-await-in-loop
    while (await knex('businesses').where({ slug }).first()) slug = `${base}-${i++}`;
    return slug;
}

/* create table on demand: business_follows */
async function ensureBusinessFollowsTable() {
    const exists = await knex.schema.hasTable('business_follows');
    if (!exists) {
        await knex.schema.createTable('business_follows', (t) => {
            t.integer('business_id').unsigned().notNullable();
            t.integer('user_id').unsigned().notNullable();
            t.timestamp('created_at').defaultTo(knex.fn.now());
            t.primary(['business_id', 'user_id']);
        });
    }
}

/* hydrate community posts with photos + author + counts (mirrors user routes) */
async function hydratePosts(postRows) {
    if (!postRows || postRows.length === 0) return [];

    const postIds = postRows.map((p) => p.id);

    let photosRaw = [];
    try {
        photosRaw = await knex('community_photos')
            .select('post_id', 'url', 'photo_url', 'path', 'position')
            .whereIn('post_id', postIds)
            .orderBy('position', 'asc');
    } catch { photosRaw = []; }

    const photosByPost = {};
    for (const r of photosRaw) {
        const url = r?.url || r?.photo_url || r?.path || null;
        if (!url) continue;
        (photosByPost[r.post_id] ||= []).push(url);
    }

    // counts (best-effort)
    const likeCounts = await knex('post_likes').select('post_id').count({ c: '*' }).whereIn('post_id', postIds).groupBy('post_id').catch(() => []);
    const commentCounts = await knex('post_comments').select('post_id').count({ c: '*' }).whereIn('post_id', postIds).groupBy('post_id').catch(() => []);
    const repostCounts = await knex('post_reposts').select('post_id').count({ c: '*' }).whereIn('post_id', postIds).groupBy('post_id').catch(() => []);
    const likes = Object.fromEntries((likeCounts || []).map((r) => [r.post_id, Number(r.c)]));
    const comments = Object.fromEntries((commentCounts || []).map((r) => [r.post_id, Number(r.c)]));
    const reposts = Object.fromEntries((repostCounts || []).map((r) => [r.post_id, Number(r.c)]));

    const authorIds = Array.from(new Set(postRows.map((p) => p.user_id)));
    const authors = await knex('users')
        .select('id', 'first_name', 'last_name', 'handle', 'profile_picture')
        .whereIn('id', authorIds);
    const authorMap = Object.fromEntries(authors.map((a) => [a.id, a]));

    return postRows.map((p) => {
        const a = authorMap[p.user_id] || {};
        return {
            ...p,
            first_name: a.first_name || '',
            last_name: a.last_name || '',
            handle: a.handle || '',
            avatar_url: a.profile_picture || '',
            date_created: p.date_created || p.created_at || p.posted_at,
            likesCount: likes[p.id] || 0,
            commentsCount: comments[p.id] || 0,
            repostsCount: reposts[p.id] || 0,
            photos: photosByPost[p.id] || [],
            category: p.category || (p.lost_or_found ? 'lost-found' : p.category || 'post'),
        };
    });
}

/* ================= LIST ================= */
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
        return res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/* ================= DETAIL ================= */
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

        let viewer_is_owner = false;
        if (viewerId) viewer_is_owner = !!(await knex('business_owners').where({ business_id: id, user_id: viewerId }).first());

        // follow status + count
        await ensureBusinessFollowsTable();
        let viewer_is_following = false;
        let followers = 0;
        try {
            const row = await knex('business_follows').where({ business_id: id, user_id: viewerId }).first();
            viewer_is_following = !!row;
            const c = await knex('business_follows').where({ business_id: id }).count({ c: '*' }).first();
            followers = Number(c?.c || 0);
        } catch { /* ignore */ }

        return res.json({
            ...b,
            hours_json: parse(b.hours_json) || null,
            amenities_json: parse(b.amenities_json) || null,
            gallery_urls: parse(b.gallery_urls) || [],
            viewer_is_owner,
            viewer_is_following,
            followers,
        });
    } catch (err) {
        console.error('[GET /api/businesses/:id] error:', err);
        return res.status(500).json({ error: 'server_error' });
    }
});

/* ================= CREATE ================= */
router.post('/', async (req, res) => {
    try {
        const {
            name, category, description, contact_email, phone, website,
            street_address, city, county, latitude, longitude,
            logo_url, cover_url, long_description = null,
            hours_json = null, amenities_json = null, price_range = null,
            facebook_url = null, instagram_url = null, twitter_url = null, youtube_url = null, tiktok_url = null,
            menu_url = null, booking_url = null, store_url = null, gallery_urls = null,
        } = req.body || {};

        if (!name || !category || !contact_email) return res.status(400).json({ error: 'missing_fields' });

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
            facebook_url, instagram_url, twitter_url, youtube_url, tiktok_url,
            menu_url, booking_url, store_url,
            gallery_urls: gallery_urls ? JSON.stringify(gallery_urls) : null,
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

/* ================= UPDATE (owner only) ================= */
router.patch('/:id', authenticateToken, async (req, res) => {
    try {
        const businessId = Number(req.params.id);
        const userId = req.user?.id;
        if (!(await isOwner(userId, businessId))) return res.status(403).json({ ok: false, error: 'not_owner' });

        const allowed = [
            'name','category','description','long_description','phone','website',
            'street_address','city','county','latitude','longitude',
            'logo_url','cover_url','price_range',
            'facebook_url','instagram_url','twitter_url','youtube_url','tiktok_url',
            'menu_url','booking_url','store_url',
            'hours_json','amenities_json','gallery_urls'
        ];
        const updates = {};
        for (const k of allowed) {
            if (req.body[k] !== undefined) {
                if (k.endsWith('_json') || k === 'gallery_urls') {
                    const parsed = safeJSON(req.body[k], req.body[k] == null ? null : req.body[k]);
                    updates[k] = parsed == null ? null : JSON.stringify(parsed);
                } else {
                    updates[k] = req.body[k];
                }
            }
        }
        await knex('businesses').where({ id: businessId }).update({ ...updates, updated_at: knex.fn.now() });
        const b = await knex('businesses').where({ id: businessId }).first();
        return res.json({ ok: true, business: b });
    } catch (err) {
        console.error('[PATCH /api/businesses/:id] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* ================= FOLLOW (viewer) ================= */
router.post('/:id/follow', authenticateToken, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const user_id = Number(req.user?.id);
        const action = String(req.body?.action || '').toLowerCase();
        await ensureBusinessFollowsTable();

        if (action === 'follow') {
            await knex('business_follows').insert({ business_id, user_id }).onConflict(['business_id', 'user_id']).ignore();
        } else if (action === 'unfollow') {
            await knex('business_follows').where({ business_id, user_id }).del();
        } else {
            return res.status(400).json({ ok: false, error: 'invalid_action' });
        }

        const c = await knex('business_follows').where({ business_id }).count({ c: '*' }).first();
        const isFollowing = !!(await knex('business_follows').where({ business_id, user_id }).first());
        return res.json({ ok: true, isFollowing, followers: Number(c?.c || 0) });
    } catch (err) {
        console.error('[POST /api/businesses/:id/follow] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* ================= REVIEWS ================= */
router.post('/:id/reviews', authenticateToken, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const user_id = req.user?.id;
        const { rating, comment = '' } = req.body || {};
        if (!user_id) return res.status(401).json({ ok: false, error: 'unauthorized' });

        const num = Number(rating);
        if (!(num >= 0.5 && num <= 5 && Math.abs(num * 2 - Math.round(num * 2)) < 1e-9)) {
            return res.status(400).json({ ok: false, error: 'rating_0.5_to_5' });
        }
        const half = Math.round(num * 2);

        const existing = await knex('business_reviews').where({ business_id, user_id }).first();
        if (existing) {
            await knex('business_reviews').where({ id: existing.id }).update({
                rating_half_stars: half,
                comment,
                updated_at: knex.fn.now(),
            });
        } else {
            await knex('business_reviews').insert({ business_id, user_id, rating_half_stars: half, comment });
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('[POST /api/businesses/:id/reviews] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.get('/:id/reviews', optionalAuth, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const viewerId = Number(req.user?.id || 0);

        const rows = await knex('business_reviews as r')
            .select(
                'r.id','r.user_id','r.rating_half_stars','r.comment','r.created_at','r.updated_at',
                knex.raw('r.user_id = ? AS is_me', [viewerId])
            )
            .where({ business_id })
            .orderBy('created_at', 'desc');

        const ids = rows.map((r) => r.id);
        const replies = ids.length
            ? await knex('business_review_replies').select('*').whereIn('review_id', ids).orderBy('created_at', 'asc')
            : [];
        const grouped = replies.reduce((acc, r) => { (acc[r.review_id] = acc[r.review_id] || []).push(r); return acc; }, {});
        const items = rows.map((r) => ({ ...r, replies: grouped[r.id] || [] }));
        const me_review = items.find((r) => r.is_me) || null;

        const can_reply = viewerId
            ? !!(await knex('business_owners').where({ business_id, user_id: viewerId }).first())
            : false;

        return res.json({ ok: true, items, can_reply, me_review });
    } catch (err) {
        console.error('[GET /api/businesses/:id/reviews] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.delete('/:id/reviews/me', authenticateToken, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const user_id = req.user?.id;
        if (!user_id) return res.status(401).json({ ok: false, error: 'unauthorized' });
        await knex('business_reviews').where({ business_id, user_id }).del();
        return res.json({ ok: true });
    } catch (err) {
        console.error('[DELETE /api/businesses/:id/reviews/me] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.post('/reviews/:reviewId/replies', authenticateToken, async (req, res) => {
    try {
        const reviewId = Number(req.params.reviewId);
        const userId = req.user?.id;
        const review = await knex('business_reviews').where({ id: reviewId }).first();
        if (!review) return res.status(404).json({ ok: false, error: 'review_not_found' });

        if (!(await isOwner(userId, review.business_id))) return res.status(403).json({ ok: false, error: 'not_owner' });

        const text = String(req.body?.text || '').trim();
        if (!text) return res.status(400).json({ ok: false, error: 'text_required' });

        let insertedId;
        try {
            const ret = await knex('business_review_replies')
                .insert({ review_id: reviewId, business_id: review.business_id, user_id: userId, text })
                .returning(['id']);
            insertedId = Array.isArray(ret) ? (typeof ret[0] === 'object' ? ret[0].id : ret[0]) : ret;
        } catch {
            const ret = await knex('business_review_replies').insert({ review_id: reviewId, business_id: review.business_id, user_id: userId, text });
            insertedId = Array.isArray(ret) ? ret[0] : ret;
        }

        const row = await knex('business_review_replies').where({ id: insertedId }).first();
        return res.json({ ok: true, reply: row });
    } catch (err) {
        console.error('[POST /api/businesses/reviews/:reviewId/replies] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* ================= MEDIA (CRUD + likes/comments) ================= */
router.get('/:id/media', async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const rows = await knex('business_media')
            .select('*')
            .where({ business_id })
            .orderBy('sort_order', 'asc')
            .orderBy('created_at', 'asc');
        return res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses/:id/media] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.post('/:id/media', authenticateToken, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const userId = req.user?.id;
        if (!(await isOwner(userId, business_id))) return res.status(403).json({ ok: false, error: 'not_owner' });

        const { type = 'photo', url, caption = null, sort_order = 0 } = req.body || {};
        if (!url || !['photo', 'video'].includes(String(type))) {
            return res.status(400).json({ ok: false, error: 'invalid_media' });
        }

        let insertedId;
        try {
            const ret = await knex('business_media')
                .insert({ business_id, user_id: userId, type, url, caption, sort_order: Number(sort_order) || 0 })
                .returning(['id']);
            insertedId = Array.isArray(ret) ? (typeof ret[0] === 'object' ? ret[0].id : ret[0]) : ret;
        } catch {
            const ret = await knex('business_media')
                .insert({ business_id, user_id: userId, type, url, caption, sort_order: Number(sort_order) || 0 });
            insertedId = Array.isArray(ret) ? ret[0] : ret;
        }

        const media = await knex('business_media').where({ id: insertedId }).first();
        return res.json({ ok: true, media });
    } catch (err) {
        console.error('[POST /api/businesses/:id/media] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.delete('/:id/media/:mediaId', authenticateToken, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const mediaId = Number(req.params.mediaId);
        const userId = req.user?.id;
        if (!(await isOwner(userId, business_id))) return res.status(403).json({ ok: false, error: 'not_owner' });
        await knex('business_media').where({ id: mediaId, business_id }).del();
        return res.json({ ok: true });
    } catch (err) {
        console.error('[DELETE /api/businesses/:id/media/:mediaId] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.patch('/:id/media/reorder', authenticateToken, async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const userId = req.user?.id;
        if (!(await isOwner(userId, business_id))) return res.status(403).json({ ok: false, error: 'not_owner' });

        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        const ops = items.map((it) =>
            knex('business_media').where({ id: Number(it.id), business_id }).update({ sort_order: Number(it.sort_order) || 0 })
        );
        await Promise.all(ops);
        return res.json({ ok: true });
    } catch (err) {
        console.error('[PATCH /api/businesses/:id/media/reorder] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.get('/media/:mediaId/likes', optionalAuth, async (req, res) => {
    try {
        const media_id = Number(req.params.mediaId);
        const viewerId = Number(req.user?.id || 0);
        const [{ c: countRaw } = { c: 0 }] = await knex('business_media_likes').count({ c: '*' }).where({ media_id });
        let liked = false;
        if (viewerId) liked = !!(await knex('business_media_likes').where({ media_id, user_id: viewerId }).first());
        return res.json({ ok: true, count: Number(countRaw || 0), liked });
    } catch (err) {
        console.error('[GET /api/businesses/media/:mediaId/likes] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.post('/media/:mediaId/likes/toggle', authenticateToken, async (req, res) => {
    try {
        const media_id = Number(req.params.mediaId);
        const user_id = req.user?.id;
        const row = await knex('business_media_likes').where({ media_id, user_id }).first();
        if (row) await knex('business_media_likes').where({ media_id, user_id }).del();
        else await knex('business_media_likes').insert({ media_id, user_id });
        const [{ c: countRaw } = { c: 0 }] = await knex('business_media_likes').count({ c: '*' }).where({ media_id });
        return res.json({ ok: true, liked: !row, count: Number(countRaw || 0) });
    } catch (err) {
        console.error('[POST /api/businesses/media/:mediaId/likes/toggle] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.get('/media/:mediaId/comments', optionalAuth, async (req, res) => {
    try {
        const media_id = Number(req.params.mediaId);
        const viewerId = Number(req.user?.id || 0);
        const sort = String(req.query.sort || 'popular').toLowerCase();

        const base = knex('business_media_comments as c')
            .leftJoin(
                knex('business_media_comment_likes').select('comment_id').count({ likes: '*' }).groupBy('comment_id').as('l'),
                'c.id',
                'l.comment_id'
            )
            .select(
                'c.id','c.media_id','c.user_id','c.parent_id','c.root_id',
                'c.reply_count','c.text','c.image_url','c.created_at',
                knex.raw('COALESCE(l.likes, 0) as like_count'),
                viewerId
                    ? knex.raw('EXISTS(SELECT 1 FROM business_media_comment_likes mcl WHERE mcl.comment_id = c.id AND mcl.user_id = ?) AS liked', [viewerId])
                    : knex.raw('0 as liked')
            )
            .where('c.media_id', media_id);

        if (sort === 'new' || sort === 'newest') base.orderBy('c.created_at', 'desc');
        else base.orderBy('like_count', 'desc').orderBy('c.created_at', 'desc');

        const rows = await base;
        return res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses/media/:mediaId/comments] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.post('/media/:mediaId/comments', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const media_id = Number(req.params.mediaId);
        const user_id = req.user?.id;
        const { text = '', parent_id = null } = req.body || {};
        const t = String(text || '').trim();
        if (!t && !req.file) return res.status(400).json({ ok: false, error: 'text_or_image_required' });

        const media = await knex('business_media').where({ id: media_id }).first();
        if (!media) return res.status(404).json({ ok: false, error: 'media_not_found' });

        const image_url = req.file ? await uploadCommentImage(req.file, media.business_id, media_id) : null;

        let root_id = null;
        let parentIdVal = parent_id ? Number(parent_id) : null;
        if (parentIdVal) {
            const parent = await knex('business_media_comments').where({ id: parentIdVal, media_id }).first();
            if (!parent) parentIdVal = null;
            root_id = parent?.root_id || parent?.id || null;
        }

        let insertedId;
        try {
            const ret = await knex('business_media_comments')
                .insert({ media_id, user_id, parent_id: parentIdVal, root_id, text: t, image_url })
                .returning(['id']);
            insertedId = Array.isArray(ret) ? (typeof ret[0] === 'object' ? ret[0].id : ret[0]) : ret;
        } catch {
            const ret = await knex('business_media_comments')
                .insert({ media_id, user_id, parent_id: parentIdVal, root_id, text: t, image_url });
            insertedId = Array.isArray(ret) ? ret[0] : ret;
        }

        if (parentIdVal) {
            await knex('business_media_comments').where({ id: parentIdVal }).update({ reply_count: knex.raw('reply_count + 1') });
        }

        const row = await knex('business_media_comments').where({ id: insertedId }).first();
        return res.json({ ok: true, comment: row });
    } catch (err) {
        console.error('[POST /api/businesses/media/:mediaId/comments] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

router.post('/media/comments/:commentId/like', authenticateToken, async (req, res) => {
    try {
        const comment_id = Number(req.params.commentId);
        const user_id = req.user?.id;

        const exist = await knex('business_media_comment_likes').where({ comment_id, user_id }).first();
        if (exist) await knex('business_media_comment_likes').where({ comment_id, user_id }).del();
        else await knex('business_media_comment_likes').insert({ comment_id, user_id });

        const [{ c: countRaw } = { c: 0 }] = await knex('business_media_comment_likes').count({ c: '*' }).where({ comment_id });
        return res.json({ ok: true, liked: !exist, count: Number(countRaw || 0) });
    } catch (err) {
        console.error('[POST /api/businesses/media/comments/:commentId/like] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* ================= POSTS (owners' community posts) ================= */
router.get('/:id/posts', async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '60', 10) || 60, 1), 200);

        const ownerRows = await knex('business_owners').select('user_id').where({ business_id });
        const ownerIds = ownerRows.map((r) => r.user_id);
        if (!ownerIds.length) return res.json({ ok: true, items: [] });

        const posts = await knex('community_posts as p')
            .select('p.*')
            .whereIn('p.user_id', ownerIds)
            .orderBy('p.id', 'desc')
            .limit(limit);

        const items = await hydratePosts(posts);
        return res.json({ ok: true, items });
    } catch (err) {
        console.error('[GET /api/businesses/:id/posts] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

/* ================= DEALS (read) ================= */
router.get('/:id/deals', async (req, res) => {
    try {
        const business_id = Number(req.params.id);
        const rows = await knex('business_deals').select('*').where({ business_id }).orderBy('created_at', 'desc');
        return res.json({ ok: true, items: rows });
    } catch (err) {
        console.error('[GET /api/businesses/:id/deals] error:', err);
        return res.status(500).json({ ok: false, error: 'server_error' });
    }
});

export default router;
