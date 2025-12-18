// backend/src/routes/community/community.js
/* ---------------------------------------------------------------------------
 * Community feed + details + comments
 * Added 2025‑11‑19: GET /trending  (windowed, time‑decayed score)
 * 2025‑11‑19 UPDATE: /trending now prefers SQL views (ll_trending_scores)
 * 2025‑11‑19 UPDATE: /trending/summary — returns category counts by location
 * 2025‑11‑19 UPDATE: GET / (feed) now supports sort=trending
 * ------------------------------------------------------------------------- */

import express           from 'express';
import db                from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';
import optionalAuth      from '../../middleware/optionalAuth.js';

const router = express.Router();

/* Pagination defaults / hard limits */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 500;

/* ---------------------------------------------------------------------------
 * Post edit history + Lost & Found resolution
 *
 * This patch adds:
 * - PATCH /api/community/:id           (edit a post; rate-limited to 5 edits / 24h)
 * - GET   /api/community/:id/edits     (fetch version history)
 * - POST  /api/community/:id/mark-found (Lost & Found: resolve a "lost" item)
 *
 * Notes:
 * - We keep the router resilient to older schemas by checking for optional
 *   columns/tables at runtime.
 * - For Lost & Found, we store the owner's resolution message in
 *   lost_and_found.resolved_message (if present) so the UI can display an
 *   "Update:" as the new description while retaining the original.
 * ------------------------------------------------------------------------- */

/* --- schema feature detection (cached) ----------------------------------- */
let HAS_POST_EDITS_TABLE = undefined; // boolean
let HAS_CP_EDITED_AT_COL = undefined; // boolean
let LF_RESOLVE_COLS = undefined; // { resolved_at, resolved_message, resolved_by_user_id }

async function hasPostEditsTable() {
    if (HAS_POST_EDITS_TABLE !== undefined) return HAS_POST_EDITS_TABLE;
    HAS_POST_EDITS_TABLE = await db.schema.hasTable('community_post_edits');
    return HAS_POST_EDITS_TABLE;
}

async function hasCommunityPostsEditedAt() {
    if (HAS_CP_EDITED_AT_COL !== undefined) return HAS_CP_EDITED_AT_COL;
    HAS_CP_EDITED_AT_COL = await db.schema.hasColumn('community_posts', 'edited_at');
    return HAS_CP_EDITED_AT_COL;
}

async function detectLostAndFoundResolveCols() {
    if (LF_RESOLVE_COLS !== undefined) return LF_RESOLVE_COLS;
    const hasTable = await db.schema.hasTable('lost_and_found');
    if (!hasTable) {
        LF_RESOLVE_COLS = { resolved_at: false, resolved_message: false, resolved_by_user_id: false };
        return LF_RESOLVE_COLS;
    }
    const [a, b, c] = await Promise.all([
        db.schema.hasColumn('lost_and_found', 'resolved_at'),
        db.schema.hasColumn('lost_and_found', 'resolved_message'),
        db.schema.hasColumn('lost_and_found', 'resolved_by_user_id'),
    ]);
    LF_RESOLVE_COLS = { resolved_at: !!a, resolved_message: !!b, resolved_by_user_id: !!c };
    return LF_RESOLVE_COLS;
}

/* Utility: build a COALESCE(exprs.) safely using only existing columns */
async function existingColumns(table, candidates) {
    const list = [];
    for (const col of candidates) {
        // eslint-disable-next-line no-await-in-loop
        if (await db.schema.hasColumn(table, col)) list.push(col);
    }
    return list;
}
function coalesceSql(prefixDot, cols, empty = '""') {
    if (!cols.length) return empty;
    const parts = cols.map((c) => `${prefixDot}\`${c}\``);
    return `COALESCE(${parts.join(', ')}, ${empty})`;
}

/* --- follow schema detection (cached) ------------------------------------ */
let FOLLOW_SCHEMA = undefined; // { table, follower, following } | null
async function detectFollowSchema() {
    if (FOLLOW_SCHEMA !== undefined) return FOLLOW_SCHEMA;

    const candidates = [
        { table: 'user_follows',     follower: 'user_id',     following: 'target_id'     },
        { table: 'user_follows',     follower: 'follower_id', following: 'following_id'  },
        { table: 'followers',        follower: 'follower_id', following: 'followee_id'   },
        { table: 'user_followers',   follower: 'user_id',     following: 'target_id'     },
        { table: 'user_followers',   follower: 'follower_id', following: 'followee_id'   },
        { table: 'follows',          follower: 'follower_id', following: 'followee_id'   },
        { table: 'follows',          follower: 'user_id',     following: 'target_id'     },
    ];

    for (const c of candidates) {
        // eslint-disable-next-line no-await-in-loop
        const hasTable = await db.schema.hasTable(c.table);
        if (!hasTable) continue;
        // eslint-disable-next-line no-await-in-loop
        const hasA = await db.schema.hasColumn(c.table, c.follower);
        // eslint-disable-next-line no-await-in-loop
        const hasB = await db.schema.hasColumn(c.table, c.following);
        if (hasA && hasB) {
            FOLLOW_SCHEMA = c;
            return FOLLOW_SCHEMA;
        }
    }
    FOLLOW_SCHEMA = null;
    return FOLLOW_SCHEMA;
}

/* Small helpers ----------------------------------------------------------- */
function parseWindowToHours(win) {
    const s = String(win || '').trim().toLowerCase();
    if (!s) return 48; // default 48h
    const m = s.match(/^(\d+)\s*(h|hr|hrs|hour|hours|d|day|days|w|wk|wks|week|weeks)?$/);
    if (!m) return 48;
    const n = Math.max(1, Math.min(24 * 30, Number(m[1]) || 48)); // cap to 30 days
    const unit = m[2] || 'h';
    if (unit.startsWith('d')) return n * 24;
    if (unit.startsWith('w')) return n * 24 * 7;
    return n; // hours
}

/* Subtype normalization
 * NOTE: We normalize underscores/spaces to dashes and lowercase so legacy values
 * like "discussion" and "general_discussion" can be matched reliably.
 */
function normalizeSubtypeSlug(val) {
    const s = String(val ?? '').trim().toLowerCase();
    if (!s) return '';
    return s.replace(/[\s_]+/g, '-');
}
function applySubtypeFilter(qb, rawSubtype) {
    const sub = normalizeSubtypeSlug(rawSubtype);
    if (!sub) return;

    // Announcements (plural in categories table, singular in posts)
    if (sub === 'announcements' || sub === 'announcement') {
        qb.where('cp.category', 'announcement');
        return;
    }

    // General Discussion (legacy slug support)
    if (sub === 'general-discussion' || sub === 'discussion') {
        qb.whereIn('cp.category', ['general-discussion', 'discussion']);
        return;
    }

    // Recommendations & Tips stored under one category; split via rt.rec_type
    if (sub === 'tips' || sub === 'tip') {
        qb.andWhere(function () {
            this.where('cp.category', 'tips')
                .orWhere(function () {
                    this.where('cp.category', 'recommendations-tips');
                    this.where('rt.rec_type', 'tip');
                });
        });
        return;
    }

    if (sub === 'recommendations') {
        qb.andWhere(function () {
            this.where('cp.category', 'recommendations')
                .orWhere(function () {
                    this.where('cp.category', 'recommendations-tips');
                    this.whereIn('rt.rec_type', ['business', 'recommendation']);
                });
        });
        return;
    }

    if (sub === 'recommendations-tips' || sub === 'recommendation') {
        qb.where('cp.category', 'recommendations-tips');
        return;
    }

    // Volunteer & Help Requests stored under one category; split via vh.request_kind
    if (sub === 'help-requests') {
        qb.andWhere(function () {
            // support a future dedicated category as well
            this.where('cp.category', 'help-requests')
                .orWhere(function () {
                    this.whereIn('cp.category', ['volunteer-requests', 'volunteer-help-requests', 'volunteer-help']);
                    this.andWhere(function () {
                        this.where('vh.request_kind', 'help');
                        this.orWhereNull('vh.request_kind');
                    });
                });
        });
        return;
    }

    if (sub === 'volunteers' || sub === 'volunteer') {
        qb.andWhere(function () {
            this.where('cp.category', 'volunteers')
                .orWhere(function () {
                    this.whereIn('cp.category', ['volunteer-requests', 'volunteer-help-requests', 'volunteer-help']);
                    this.where('vh.request_kind', 'volunteer');
                });
        });
        return;
    }

    // Combined view (unsplit)
    if (sub === 'volunteer-requests' || sub === 'volunteer-help-requests' || sub === 'volunteer-help') {
        qb.andWhere(function () {
            this.whereIn('cp.category', ['volunteer-requests', 'volunteer-help-requests', 'volunteer-help']);
        });
        return;
    }

    // Default: exact match
    qb.where('cp.category', sub);
}


/* =========================================================================
 * EDIT / DELETE community posts
 *  - PATCH /api/community/:id       (edit post fields + optional photo URLs)
 *  - GET   /api/community/:id/edits (edit history)
 *  - POST  /api/community/:id/mark-found (lost & found resolve)
 *  - DELETE /api/community/:id      (delete post + related rows)
 * ========================================================================= */

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EDIT_MAX_PER_WINDOW = 5;

async function canEditPostNow(postId) {
    const enabled = await hasPostEditsTable();
    if (!enabled) return { ok: true, remaining: EDIT_MAX_PER_WINDOW, resetAt: null };

    const since = new Date(Date.now() - EDIT_WINDOW_MS);
    const row = await db('community_post_edits')
        .where({ post_id: postId })
        .andWhere('edited_at', '>=', since)
        .count({ n: '*' })
        .first();

    const used = Number(row?.n || 0);
    const remaining = Math.max(0, EDIT_MAX_PER_WINDOW - used);

    if (remaining > 0) return { ok: true, remaining, resetAt: null };

    // next allowed is at the window boundary of the oldest edit in the window
    const oldest = await db('community_post_edits')
        .select('edited_at')
        .where({ post_id: postId })
        .andWhere('edited_at', '>=', since)
        .orderBy('edited_at', 'asc')
        .first();

    const resetAt = oldest?.edited_at ? new Date(new Date(oldest.edited_at).getTime() + EDIT_WINDOW_MS) : null;
    return { ok: false, remaining: 0, resetAt };
}

async function safeInsertEditSnapshot(trx, payload) {
    const enabled = await hasPostEditsTable();
    if (!enabled) return;

    // community_post_edits schema differs across environments:
    // Most use `edited_at`; some older installs use `created_at`.
    let tsCol = null;
    try {
        if (await trx.schema.hasColumn('community_post_edits', 'edited_at')) tsCol = 'edited_at';
        else if (await trx.schema.hasColumn('community_post_edits', 'created_at')) tsCol = 'created_at';
    } catch {
        // ignore schema detection errors; we'll attempt inserts without a timestamp
    }

    const base = {
        post_id: payload.post_id,
        user_id: payload.user_id,
        ...(tsCol ? { [tsCol]: trx.fn.now() } : {}),
    };

    const snapshotJson = payload.snapshot_json || null;

    const attempts = [
        { ...base, snapshot_json: snapshotJson },
        { ...base, snapshot: snapshotJson },
        { ...base, data_json: snapshotJson },
        { ...base, data: snapshotJson },
        { ...base }, // minimal schema
    ];

    for (let i = 0; i < attempts.length; i += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            await trx('community_post_edits').insert(attempts[i]);
            return;
        } catch {
            // try next shape
        }
    }
}

async function fetchCommunityPostById(postId, viewerId) {
    let q = db('community_posts as cp')
        .join('users as u', 'cp.user_id', 'u.id')
        .leftJoin('community_categories as cc', 'cp.category', 'cc.slug')
        .leftJoin('lost_and_found as lf', 'cp.id', 'lf.id')
        .leftJoin('announcements as a', 'cp.id', 'a.id')
        .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
        .leftJoin('community_photos as p', 'cp.id', 'p.post_id')
        .leftJoin('recommendations_and_tips as rt', 'cp.id', 'rt.id')
        .leftJoin('volunteer_help_requests as vh', 'cp.id', 'vh.id')
        .leftJoin('ll_trending_scores as ts', 'ts.post_id', 'cp.id')
        .where('cp.id', postId);

    const select = [
        'cp.id',
        'cp.user_id',
        'cp.category',
        'cp.posted_at as posted_at',
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
        db.raw('COALESCE(u.handle, "") AS handle'),
        db.raw('COALESCE(u.avatar_url, "") AS avatar_url'),
        db.raw('COALESCE(u.profile_picture, "") AS profile_picture'),

        db.raw('cc.label AS categoryLabel'),

        'lf.lost_or_found',
        'lf.reward',
        // optional resolve fields (will be null if column does not exist)
        db.raw('COALESCE(lf.resolved_at, NULL) AS resolved_at'),
        db.raw('COALESCE(lf.resolved_message, "") AS resolved_message'),
        db.raw('COALESCE(lf.resolved_by_user_id, NULL) AS resolved_by_user_id'),

        'vh.help_type',
        'vh.request_kind',
        'vh.needed_date',
        'vh.contact',
        db.raw('MAX(rt.rec_type) AS rec_type'),

        db.raw('COALESCE(JSON_ARRAYAGG(p.url), JSON_ARRAY()) AS photos'),

        db('post_likes')
            .count('*')
            .whereRaw('category = ? AND post_id = cp.id', ['community_post'])
            .as('likesCount'),

        db('post_comments')
            .count('*')
            .whereRaw('post_id = cp.id')
            .as('commentsCount'),

        db('post_reposts')
            .count('*')
            .whereRaw('post_id = cp.id')
            .as('repostsCount'),

        db.raw(
            'EXISTS (SELECT 1 FROM post_likes WHERE category = ? AND post_id = cp.id AND user_id = ?) AS viewerLiked',
            ['community_post', viewerId],
        ),
        db.raw(
            'EXISTS (SELECT 1 FROM post_reposts WHERE post_id = cp.id AND user_id = ?) AS viewerReposted',
            [viewerId],
        ),

        db.raw('COALESCE(MAX(ts.trending_score), 0) AS score'),
    ];

    q.groupBy('cp.id');
    return q.first(select);
}

/* GET /api/community/:id/edits -------------------------------------------- */
router.get('/:id/edits', authenticateToken, async (req, res, next) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const post = await db('community_posts').select('id', 'user_id').where({ id: postId }).first();
        if (!post) return res.status(404).json({ message: 'Not found' });
        if (Number(post.user_id) !== Number(req.user.id)) {
            return res.status(403).json({ message: 'Not allowed' });
        }

        const enabled = await hasPostEditsTable();
        if (!enabled) return res.json([]);

        const tsCol = (await db.schema.hasColumn('community_post_edits', 'edited_at'))
            ? 'edited_at'
            : (await db.schema.hasColumn('community_post_edits', 'created_at'))
                ? 'created_at'
                : null;

        let q = db('community_post_edits').where({ post_id: postId });
        if (tsCol) q = q.orderBy(tsCol, 'desc');
        const rows = await q.limit(50);

        return res.json(rows);
    } catch (err) {
        return next(err);
    }
});

/* POST /api/community/:id/mark-found -------------------------------------- */
router.post('/:id/mark-found', authenticateToken, express.json({ limit: '1mb' }), async (req, res, next) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const post = await db('community_posts').select('id', 'user_id', 'category').where({ id: postId }).first();
        if (!post) return res.status(404).json({ message: 'Not found' });
        if (Number(post.user_id) !== Number(req.user.id)) {
            return res.status(403).json({ message: 'Not allowed' });
        }

        const lfCols = await detectLostAndFoundResolveCols();
        if (!lfCols.resolved_at && !lfCols.resolved_message && !lfCols.resolved_by_user_id) {
            return res.status(501).json({ message: 'Mark Found is not configured.' });
        }

        const msg = String(req.body?.message || '').slice(0, 2000);

        await db('lost_and_found')
            .where({ id: postId })
            .update({
                ...(lfCols.resolved_at ? { resolved_at: db.fn.now() } : {}),
                ...(lfCols.resolved_message ? { resolved_message: msg } : {}),
                ...(lfCols.resolved_by_user_id ? { resolved_by_user_id: req.user.id } : {}),
            });

        const updated = await fetchCommunityPostById(postId, req.user.id);
        return res.json(updated || { ok: true });
    } catch (err) {
        return next(err);
    }
});

/* PATCH /api/community/:id ----------------------------------------------- */
/* PATCH /api/community/:id ----------------------------------------------- */
router.patch('/:id', authenticateToken, express.json({ limit: '2mb' }), async (req, res, next) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const post = await db('community_posts')
            .select('id', 'user_id', 'category', 'title', 'description', 'city', 'county', 'street_address')
            .where({ id: postId })
            .first();

        if (!post) return res.status(404).json({ message: 'Not found' });
        if (Number(post.user_id) !== Number(req.user.id)) {
            return res.status(403).json({ message: 'Not allowed' });
        }

        const limitCheck = await canEditPostNow(postId);
        if (!limitCheck.ok) {
            return res.status(429).json({
                message: 'You can edit a post up to 5 times within a 24-hour window.',
                remaining: 0,
                resetAt: limitCheck.resetAt ? limitCheck.resetAt.toISOString() : null,
            });
        }

        const body = req.body || {};
        const updates = {};

        const setIfString = async (col, maxLen) => {
            if (!Object.prototype.hasOwnProperty.call(body, col)) return;
            const hasCol = await db.schema.hasColumn('community_posts', col);
            if (!hasCol) return;
            updates[col] = String(body[col] ?? '').slice(0, maxLen);
        };

        await setIfString('title', 120);
        await setIfString('description', 5000);
        await setIfString('city', 120);
        await setIfString('county', 120);
        await setIfString('street_address', 255);
        await setIfString('visibility', 20);

        const hasEditedAt = await hasCommunityPostsEditedAt();
        if (hasEditedAt) updates.edited_at = db.fn.now();

        // Optional photos as URL array: replace all existing in that order.
        const wantsPhotos =
            Object.prototype.hasOwnProperty.call(body, 'photos') && Array.isArray(body.photos);

        await db.transaction(async (trx) => {
            // log snapshot (best effort)
            const snapshot = {
                before: {
                    title: post.title || '',
                    description: post.description || '',
                    city: post.city || '',
                    county: post.county || '',
                    street_address: post.street_address || '',
                },
                after: {
                    ...(Object.prototype.hasOwnProperty.call(updates, 'title')
                        ? { title: updates.title }
                        : {}),
                    ...(Object.prototype.hasOwnProperty.call(updates, 'description')
                        ? { description: updates.description }
                        : {}),
                    ...(Object.prototype.hasOwnProperty.call(updates, 'city') ? { city: updates.city } : {}),
                    ...(Object.prototype.hasOwnProperty.call(updates, 'county') ? { county: updates.county } : {}),
                    ...(Object.prototype.hasOwnProperty.call(updates, 'street_address')
                        ? { street_address: updates.street_address }
                        : {}),
                },
            };

            await safeInsertEditSnapshot(trx, {
                post_id: postId,
                user_id: req.user.id,
                snapshot_json: JSON.stringify(snapshot),
            });

            if (Object.keys(updates).length) {
                await trx('community_posts').where({ id: postId }).update(updates);
            }

            // Lost & Found
            if (await trx.schema.hasTable('lost_and_found')) {
                const lfUp = {};
                if (
                    Object.prototype.hasOwnProperty.call(body, 'lost_or_found') &&
                    (await trx.schema.hasColumn('lost_and_found', 'lost_or_found'))
                ) {
                    lfUp.lost_or_found = String(body.lost_or_found || '').slice(0, 30);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'reward') &&
                    (await trx.schema.hasColumn('lost_and_found', 'reward'))
                ) {
                    const n = Number(body.reward);
                    lfUp.reward = Number.isFinite(n) ? n : null;
                }
                if (Object.keys(lfUp).length) {
                    await trx('lost_and_found').where({ id: postId }).update(lfUp);
                }
            }

            // Recommendations / Tips
            if (await trx.schema.hasTable('recommendations_and_tips')) {
                const rtUp = {};
                if (
                    Object.prototype.hasOwnProperty.call(body, 'rec_type') &&
                    (await trx.schema.hasColumn('recommendations_and_tips', 'rec_type'))
                ) {
                    rtUp.rec_type = String(body.rec_type || '').slice(0, 40);
                }
                if (Object.keys(rtUp).length) {
                    await trx('recommendations_and_tips').where({ id: postId }).update(rtUp);
                }
            }

            // Volunteer / Help
            if (await trx.schema.hasTable('volunteer_help_requests')) {
                const vhUp = {};
                if (
                    Object.prototype.hasOwnProperty.call(body, 'help_type') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'help_type'))
                ) {
                    vhUp.help_type = String(body.help_type || '').slice(0, 60);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'request_kind') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'request_kind'))
                ) {
                    vhUp.request_kind = String(body.request_kind || '').slice(0, 40);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'needed_date') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'needed_date'))
                ) {
                    const d = String(body.needed_date || '').slice(0, 10);
                    vhUp.needed_date = d || null;
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'contact') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'contact'))
                ) {
                    vhUp.contact = String(body.contact || '').slice(0, 255);
                }
                // Optional fields (best effort)
                if (
                    Object.prototype.hasOwnProperty.call(body, 'help_type_other') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'help_type_other'))
                ) {
                    vhUp.help_type_other = String(body.help_type_other || '').slice(0, 120);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'contact_method') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'contact_method'))
                ) {
                    vhUp.contact_method = String(body.contact_method || '').slice(0, 40);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'urgency') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'urgency'))
                ) {
                    vhUp.urgency = String(body.urgency || '').slice(0, 40);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'needed_time') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'needed_time'))
                ) {
                    vhUp.needed_time = String(body.needed_time || '').slice(0, 80);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'helpers_needed') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'helpers_needed'))
                ) {
                    vhUp.helpers_needed = String(body.helpers_needed || '').slice(0, 20);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'availability') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'availability'))
                ) {
                    vhUp.availability = String(body.availability || '').slice(0, 160);
                }
                if (
                    Object.prototype.hasOwnProperty.call(body, 'travel_radius') &&
                    (await trx.schema.hasColumn('volunteer_help_requests', 'travel_radius'))
                ) {
                    vhUp.travel_radius = String(body.travel_radius || '').slice(0, 60);
                }

                if (Object.keys(vhUp).length) {
                    await trx('volunteer_help_requests').where({ id: postId }).update(vhUp);
                }
            }

            // Photos: replace list of URLs
            if (wantsPhotos && (await trx.schema.hasTable('community_photos'))) {
                const hasUrl = await trx.schema.hasColumn('community_photos', 'url');
                const hasPostId = await trx.schema.hasColumn('community_photos', 'post_id');
                if (hasUrl && hasPostId) {
                    await trx('community_photos').where({ post_id: postId }).del();

                    const urls = body.photos
                        .map((u) => String(u || '').trim())
                        .filter(Boolean)
                        .slice(0, 12);

                    if (urls.length) {
                        await trx('community_photos').insert(
                            urls.map((url) => ({ post_id: postId, url }))
                        );
                    }
                }
            }
        });

        const updated = await fetchCommunityPostById(postId, req.user.id);
        return res.json(updated || { ok: true });
    } catch (err) {
        return next(err);
    }
});

/* DELETE /api/community/:id ------------------------------------------------ */
router.delete('/:id', authenticateToken, async (req, res, next) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const post = await db('community_posts').select('id', 'user_id').where({ id: postId }).first();
        if (!post) return res.status(404).json({ message: 'Not found' });
        if (Number(post.user_id) !== Number(req.user.id)) {
            return res.status(403).json({ message: 'Not allowed' });
        }

        await db.transaction(async (trx) => {
            const safeDel = async (table, where) => {
                try {
                    const exists = await trx.schema.hasTable(table);
                    if (!exists) return;
                    await trx(table).where(where).del();
                } catch {
                    // ignore
                }
            };

            await safeDel('community_photos', { post_id: postId });
            await safeDel('post_likes', { post_id: postId, category: 'community_post' });
            await safeDel('post_reposts', { post_id: postId });
            await safeDel('post_comments', { post_id: postId });
            await safeDel('post_flags', { post_id: postId });

            await safeDel('lost_and_found', { id: postId });
            await safeDel('announcements', { id: postId });
            await safeDel('public_safety_alerts', { id: postId });
            await safeDel('recommendations_and_tips', { id: postId });
            await safeDel('volunteer_help_requests', { id: postId });

            await safeDel('community_post_edits', { post_id: postId });

            await trx('community_posts').where({ id: postId }).del();
        });

        return res.json({ ok: true, deletedId: postId });
    } catch (err) {
        return next(err);
    }
});


/* ---------------------------------------------------------------------------
 * GET /api/community/trending
 * Returns trending posts within a time window.
 * ------------------------------------------------------------------------- */
router.get('/trending', optionalAuth, async (req, res, next) => {
    try {
        const {
            window: win = '48h',
            halfLife: halfLifeQ = '36',
            limit: limitQ = DEFAULT_LIMIT,
            offset: offsetQ = 0,
            subtype = '',
            city = '',
            county = '',
            user: userParam = '',
            view: viewParamRaw = '',
        } = req.query;

        const viewParam = String(viewParamRaw || '').trim().toLowerCase();

        const limit  = Math.max(1, Math.min(Number(limitQ)  || DEFAULT_LIMIT, MAX_LIMIT));
        const offset = Math.max(0, Number(offsetQ) || 0);

        const viewerId = req.user?.id || 0;

        const hoursWindow = parseWindowToHours(win);
        const halfLife = Math.max(6, Math.min(24 * 14, Number(halfLifeQ) || 36));

        // Prefer your precomputed view if it exists
        const hasTsView = await db.schema.hasTable('ll_trending_scores');

        if (hasTsView) {
            let q = db('community_posts as cp')
                .join('users as u', 'cp.user_id', 'u.id')
                .leftJoin('community_categories as cc',  'cp.category', 'cc.slug')
                .leftJoin('lost_and_found as lf',        'cp.id', 'lf.id')
                .leftJoin('announcements as a',          'cp.id', 'a.id')
                .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
                .leftJoin('community_photos as p',       'cp.id', 'p.post_id')
                .leftJoin('recommendations_and_tips as rt',  'cp.id', 'rt.id')
                .leftJoin('volunteer_help_requests as vh',   'cp.id', 'vh.id')
                .leftJoin('ll_trending_scores as ts', 'ts.post_id', 'cp.id')
                .whereRaw('cp.posted_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hoursWindow]);

            if (subtype) applySubtypeFilter(q, subtype);

            if (String(userParam).trim()) {
                const raw = String(userParam).trim();
                if (/^\d+$/.test(raw)) {
                    q.andWhere('cp.user_id', Number(raw));
                } else {
                    const handle = raw.replace(/^@/, '').toLowerCase();
                    q.andWhereRaw('LOWER(u.handle) = ?', [handle]);
                }
            }

            if (viewParam === 'mine') {
                if (viewerId) q.andWhere('cp.user_id', viewerId);
                else q.whereRaw('1=0');
            } else if (viewParam === 'following') {
                if (!viewerId) {
                    q.whereRaw('1=0');
                } else {
                    const schema = await detectFollowSchema();
                    if (schema) {
                        q.andWhereExists(function () {
                            this.select(db.raw('1'))
                                .from(`${schema.table} as f`)
                                .whereRaw(`f.\`${schema.follower}\` = ? AND f.\`${schema.following}\` = cp.user_id`, [viewerId]);
                        });
                    } else {
                        q.whereRaw('1=0');
                    }
                }
            }

            const hasVisibility = await db.schema.hasColumn('community_posts', 'visibility');
            if (hasVisibility) {
                const follow = await detectFollowSchema();
                q.andWhere(function () {
                    this.whereNull('cp.visibility').orWhere('cp.visibility', 'public');
                    if (viewerId && follow) {
                        this.orWhere(function () {
                            this.where('cp.visibility', 'followers').andWhereExists(function () {
                                this.select(db.raw('1'))
                                    .from(`${follow.table} as f`)
                                    .whereRaw(`f.\`${follow.follower}\` = ? AND f.\`${follow.following}\` = cp.user_id`, [viewerId]);
                            });
                        });
                    }
                });
            }

            if (city.trim())   q.whereRaw('LOWER(cp.city)   = ?', city.trim().toLowerCase());
            if (county.trim()) q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());

            const select = [
                'cp.id',
                'cp.category',
                'cp.posted_at as posted_at',
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
                db.raw('COALESCE(u.handle, "") AS handle'),
                db.raw('COALESCE(u.avatar_url, "") AS avatar_url'),
                db.raw('COALESCE(u.profile_picture, "") AS profile_picture'),

                db.raw('cc.label AS categoryLabel'),
                'lf.lost_or_found',
                'lf.reward',
                'vh.help_type',
                'vh.request_kind',
                'vh.needed_date',
                'vh.contact',
                db.raw('MAX(rt.rec_type) AS rec_type'),

                db.raw('COALESCE(JSON_ARRAYAGG(p.url), JSON_ARRAY()) AS photos'),

                db.raw('COALESCE(MAX(ts.likes), 0)    AS likesCount'),
                db.raw('COALESCE(MAX(ts.comments), 0) AS commentsCount'),
                db.raw('COALESCE(MAX(ts.reposts), 0)  AS repostsCount'),

                db.raw(
                    'EXISTS (SELECT 1 FROM post_likes WHERE category = ? AND post_id = cp.id AND user_id = ?) AS viewerLiked',
                    ['community_post', viewerId],
                ),
                db.raw(
                    'EXISTS (SELECT 1 FROM post_reposts WHERE post_id = cp.id AND user_id = ?) AS viewerReposted',
                    [viewerId],
                ),

                db.raw('COALESCE(MAX(ts.trending_score), 0) AS score'),
            ];

            q.groupBy('cp.id');
            q.orderBy([{ column: 'score', order: 'desc' }, { column: 'cp.posted_at', order: 'desc' }]);

            const rows = await q.limit(limit).offset(offset).select(select);
            return res.json(rows);
        }

        // ---------- fallback path (no view) ----------
        let q = db('community_posts as cp')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_categories as cc',  'cp.category', 'cc.slug')
            .leftJoin('lost_and_found as lf',        'cp.id', 'lf.id')
            .leftJoin('announcements as a',          'cp.id', 'a.id')
            .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
            .leftJoin('community_photos as p',       'cp.id', 'p.post_id')
            .leftJoin('recommendations_and_tips as rt',  'cp.id', 'rt.id')
            .leftJoin('volunteer_help_requests as vh',   'cp.id', 'vh.id');

        if (subtype) applySubtypeFilter(q, subtype);

        if (String(userParam).trim()) {
            const raw = String(userParam).trim();
            if (/^\d+$/.test(raw)) {
                q.andWhere('cp.user_id', Number(raw));
            } else {
                const handle = raw.replace(/^@/, '').toLowerCase();
                q.andWhereRaw('LOWER(u.handle) = ?', [handle]);
            }
        }

        if (viewParam === 'mine') {
            if (viewerId) q.andWhere('cp.user_id', viewerId);
            else q.whereRaw('1=0');
        } else if (viewParam === 'following') {
            if (!viewerId) {
                q.whereRaw('1=0');
            } else {
                const schema = await detectFollowSchema();
                if (schema) {
                    q.andWhereExists(function () {
                        this.select(db.raw('1'))
                            .from(`${schema.table} as f`)
                            .whereRaw(`f.\`${schema.follower}\` = ? AND f.\`${schema.following}\` = cp.user_id`, [viewerId]);
                    });
                } else {
                    q.whereRaw('1=0');
                }
            }
        }

        const hasVisibility = await db.schema.hasColumn('community_posts', 'visibility');
        if (hasVisibility) {
            const follow = await detectFollowSchema();
            q.andWhere(function () {
                this.whereNull('cp.visibility').orWhere('cp.visibility', 'public');
                if (viewerId && follow) {
                    this.orWhere(function () {
                        this.where('cp.visibility', 'followers').andWhereExists(function () {
                            this.select(db.raw('1'))
                                .from(`${follow.table} as f`)
                                .whereRaw(`f.\`${follow.follower}\` = ? AND f.\`${follow.following}\` = cp.user_id`, [viewerId]);
                        });
                    });
                }
            });
        }

        if (city.trim())   q.whereRaw('LOWER(cp.city)   = ?', city.trim().toLowerCase());
        if (county.trim()) q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());

        const titleCols = await existingColumns('community_posts', ['title']);
        const bodyCols  = await existingColumns('community_posts', ['description', 'body', 'content', 'message', 'text']);
        const cityCols  = await existingColumns('community_posts', ['city']);
        const countyCols= await existingColumns('community_posts', ['county']);
        const addrCols  = await existingColumns('community_posts', ['street_address', 'address', 'location']);

        const select = [
            'cp.id',
            'cp.category',
            'cp.posted_at as posted_at',
            'cp.posted_at as date_created',
            'cp.latitude',
            'cp.longitude',
            db.raw(`${coalesceSql('cp.', titleCols, '""')} AS title`),
            db.raw(`${coalesceSql('cp.', bodyCols, '""')} AS description`),
            db.raw(`${coalesceSql('cp.', cityCols, '""')} AS city`),
            db.raw(`${coalesceSql('cp.', countyCols, '""')} AS county`),
            db.raw(`${coalesceSql('cp.', addrCols, '""')} AS street_address`),

            'u.first_name',
            'u.last_name',
            db.raw('COALESCE(u.handle, "") AS handle'),
            db.raw('COALESCE(u.avatar_url, "") AS avatar_url'),
            db.raw('COALESCE(u.profile_picture, "") AS profile_picture'),

            db.raw('cc.label AS categoryLabel'),
            'lf.lost_or_found',
            'lf.reward',
            'vh.help_type',
            'vh.request_kind',
            'vh.needed_date',
            'vh.contact',
            db.raw('MAX(rt.rec_type) AS rec_type'),

            db.raw('COALESCE(JSON_ARRAYAGG(p.url), JSON_ARRAY()) AS photos'),

            db('post_likes')
                .count('*')
                .whereRaw('category = ? AND post_id = cp.id', ['community_post'])
                .as('likesCount'),

            db.raw(
                'EXISTS (SELECT 1 FROM post_likes WHERE category = ? AND post_id = cp.id AND user_id = ?) AS viewerLiked',
                ['community_post', viewerId],
            ),

            db('post_comments')
                .count('*')
                .whereRaw('post_id = cp.id')
                .as('commentsCount'),

            db('post_reposts')
                .count('*')
                .whereRaw('post_id = cp.id')
                .as('repostsCount'),
            db.raw(
                'EXISTS (SELECT 1 FROM post_reposts WHERE post_id = cp.id AND user_id = ?) AS viewerReposted',
                [viewerId],
            ),
        ];

        // Add a trending score when needed (view table or fallback)
        if (sort === 'trending' && hasTsView) {
            select.push(db.raw('COALESCE(MAX(ts.trending_score), 0) AS score'));
        } else if (sort === 'trending' && !hasTsView) {
            const windowSql = 'DATE_SUB(NOW(), INTERVAL ? HOUR)';
            select.push(
                db.raw(
                    `(
                      (
                        (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = cp.id AND pl.category='community_post' AND pl.created_at >= ${windowSql}) * 1.0
                      + (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = cp.id AND pc.created_at >= ${windowSql}) * 1.5
                      + (SELECT COUNT(*) FROM post_reposts  pr WHERE pr.post_id = cp.id AND pr.created_at >= ${windowSql}) * 2.0
                      - (SELECT COUNT(*) FROM post_flags    pf WHERE pf.post_id = cp.id AND pf.created_at >= ${windowSql}) * 2.0
                      ) * POW(0.5, GREATEST(TIMESTAMPDIFF(HOUR, cp.posted_at, NOW()), 0) / ?)
                    ) AS score`,
                    [hoursWindow, hoursWindow, hoursWindow, hoursWindow, halfLife]
                )
            );
        }

        q.groupBy('cp.id');

        if (sort === 'popular') {
            q.orderBy('likesCount', 'desc').orderBy('cp.posted_at', 'desc');
        } else if (sort === 'trending') {
            q.orderBy('score', 'desc').orderBy('cp.posted_at', 'desc');
        } else {
            q.orderBy('cp.posted_at', 'desc');
        }

        const posts = await q.limit(limit).offset(offset).select(select);
        return res.json(posts);
    } catch (err) {
        return next(err);
    }
});

/* =========================================================================
 * NEW: GET /api/community/trending/summary
 * Returns counts of trending posts grouped by category for a given location.
 * Query: city=, county=, window=24h|48h|7d (default 48h), limit (default 8)
 * ======================================================================= */
router.get('/trending/summary', optionalAuth, async (req, res, next) => {
    try {
        const { city = '', county = '', window: win = '48h', limit: limitQ = 8 } = req.query;
        const hoursWindow = parseWindowToHours(win);
        const limit = Math.max(1, Math.min(Number(limitQ) || 8, 20));

        // Align Trending Summary categories with the UI (split legacy combined categories)
        const categoryExpr = `
            CASE
                WHEN LOWER(cp.category) IN ('general-discussion', 'discussion') THEN 'general-discussion'
                WHEN LOWER(cp.category) IN ('announcement', 'announcements') THEN 'announcement'

                WHEN LOWER(cp.category) = 'recommendations-tips' THEN
                    CASE
                        WHEN LOWER(COALESCE(rt.rec_type, '')) IN ('tip', 'tips') THEN 'tips'
                        ELSE 'recommendations'
                    END
                WHEN LOWER(cp.category) IN ('tips', 'tip') THEN 'tips'
                WHEN LOWER(cp.category) IN ('recommendations', 'recommendation') THEN 'recommendations'

                WHEN LOWER(cp.category) IN ('volunteer-requests', 'volunteer-help-requests', 'volunteer-help') THEN
                    CASE
                        WHEN LOWER(COALESCE(vh.request_kind, '')) IN ('volunteer', 'volunteering', 'offer', 'offers', 'offering') THEN 'volunteers'
                        ELSE 'help-requests'
                    END
                WHEN LOWER(cp.category) = 'help-requests' THEN 'help-requests'
                WHEN LOWER(cp.category) IN ('volunteers', 'volunteer') THEN 'volunteers'

                WHEN LOWER(cp.category) IN ('lost-and-found', 'lost-found') THEN 'lost-and-found'
                WHEN LOWER(cp.category) = 'public-safety-alerts' THEN 'public-safety-alerts'

                ELSE LOWER(cp.category)
            END
        `;

        const labelExpr = `
            CASE
                WHEN LOWER(cp.category) IN ('general-discussion', 'discussion') THEN 'Discussions'
                WHEN LOWER(cp.category) IN ('announcement', 'announcements') THEN 'Announcements'

                WHEN LOWER(cp.category) = 'recommendations-tips' THEN
                    CASE
                        WHEN LOWER(COALESCE(rt.rec_type, '')) IN ('tip', 'tips') THEN 'Tips'
                        ELSE 'Recommendations'
                    END
                WHEN LOWER(cp.category) IN ('tips', 'tip') THEN 'Tips'
                WHEN LOWER(cp.category) IN ('recommendations', 'recommendation') THEN 'Recommendations'

                WHEN LOWER(cp.category) IN ('volunteer-requests', 'volunteer-help-requests', 'volunteer-help') THEN
                    CASE
                        WHEN LOWER(COALESCE(vh.request_kind, '')) IN ('volunteer', 'volunteering', 'offer', 'offers', 'offering') THEN 'Volunteers'
                        ELSE 'Help Requests'
                    END
                WHEN LOWER(cp.category) = 'help-requests' THEN 'Help Requests'
                WHEN LOWER(cp.category) IN ('volunteers', 'volunteer') THEN 'Volunteers'

                WHEN LOWER(cp.category) IN ('lost-and-found', 'lost-found') THEN 'Lost & Found'
                WHEN LOWER(cp.category) = 'public-safety-alerts' THEN 'Safety Alerts'

                ELSE COALESCE(cc.label, cp.category)
            END
        `;

        const windowSql = 'DATE_SUB(NOW(), INTERVAL ? HOUR)';

        const runFallback = async () => {
            let q = db('community_posts as cp')
                .leftJoin('community_categories as cc', 'cp.category', 'cc.slug')
                .leftJoin('recommendations_and_tips as rt', 'cp.id', 'rt.id')
                .leftJoin('volunteer_help_requests as vh', 'cp.id', 'vh.id')
                .whereRaw('cp.posted_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hoursWindow]);

            if (city.trim()) q.whereRaw('LOWER(cp.city) = ?', city.trim().toLowerCase());
            if (county.trim()) q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());

            const scoreNumerator = `
                (
                  (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = cp.id AND pl.category='community_post' AND pl.created_at >= ${windowSql}) * 1.0
                + (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = cp.id AND pc.created_at >= ${windowSql}) * 1.5
                + (SELECT COUNT(*) FROM post_reposts  pr WHERE pr.post_id = cp.id AND pr.created_at >= ${windowSql}) * 2.0
                - (SELECT COUNT(*) FROM post_flags    pf WHERE pf.post_id = cp.id AND pf.created_at >= ${windowSql}) * 2.0
                )
            `;

            const rows = await q
                .select(
                    db.raw(`${categoryExpr} AS category`),
                    db.raw(`${labelExpr} AS label`),
                    db.raw(`SUM( (${scoreNumerator}) > 0 ) AS count`, [
                        hoursWindow,
                        hoursWindow,
                        hoursWindow,
                        hoursWindow,
                    ])
                )
                .groupByRaw(`${categoryExpr}, ${labelExpr}`)
                .havingRaw('count > 0')
                .orderBy('count', 'desc')
                .limit(limit);

            return rows;
        };

        const hasTsView = await db.schema.hasTable('ll_trending_scores');

        if (hasTsView) {
            // Prefer your scored view if it has non-zero results (some setups materialize this and refresh on a schedule)
            let q = db('ll_trending_scores as ts')
                .join('community_posts as cp', 'cp.id', 'ts.post_id')
                .leftJoin('community_categories as cc', 'cp.category', 'cc.slug')
                .leftJoin('recommendations_and_tips as rt', 'cp.id', 'rt.id')
                .leftJoin('volunteer_help_requests as vh', 'cp.id', 'vh.id')
                .whereRaw('cp.posted_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hoursWindow]);

            if (city.trim()) q.whereRaw('LOWER(cp.city) = ?', city.trim().toLowerCase());
            if (county.trim()) q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());

            const rows = await q
                .select(
                    db.raw(`${categoryExpr} AS category`),
                    db.raw(`${labelExpr} AS label`),
                    db.raw('COUNT(*) AS count')
                )
                .where('ts.trending_score', '>', 0)
                .groupByRaw(`${categoryExpr}, ${labelExpr}`)
                .orderBy('count', 'desc')
                .limit(limit);

            if (Array.isArray(rows) && rows.length) {
                return res.json(rows);
            }
            // fall through to live-computed fallback when the view is empty / not refreshed
        }

        const rows = await runFallback();
        return res.json(rows);
    } catch (err) {
        return next(err);
    }
});

/* ---------------------------------------------------------------------------
 * GET /api/community  (feed list – now supports sort=trending)
 * Includes search, subtype, view=mine|following, city/county, popular/newest/trending
 * ------------------------------------------------------------------------- */
router.get('/', optionalAuth, async (req, res, next) => {
    try {
        const {
            search = '',
            subtype = '',
            sort = 'newest',               // 'newest' | 'popular' | 'trending'
            city = '',
            county = '',
            user: userParam = '',
            window: win = '48h',           // used when sort=trending and no view table
            halfLife: halfLifeQ = '36',    // used when sort=trending and no view table
            limit:  limitQ  = DEFAULT_LIMIT,
            offset: offsetQ = 0,
        } = req.query;

        const viewParam = String(req.query.view || req.query.selectedView || '').trim().toLowerCase();

        const isTrendingView = viewParam === 'trending';
        const includeTotal = String(req.query.includeTotal || req.query.withTotal || '').trim() === '1';
        const wantTrendingScore = isTrendingView || sort === 'trending';

        const limit  = Math.max(1, Math.min(Number(limitQ)  || DEFAULT_LIMIT, MAX_LIMIT));
        const offset = Math.max(0, Number(offsetQ) || 0);

        const viewerId = req.user?.id || 0;

        const hasTsView = await db.schema.hasTable('ll_trending_scores');
        const hoursWindow = parseWindowToHours(win);
        const halfLife    = Math.max(6, Math.min(24 * 14, Number(halfLifeQ) || 36));

        let q = db('community_posts as cp')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_categories as cc',  'cp.category', 'cc.slug')
            .leftJoin('lost_and_found as lf',        'cp.id', 'lf.id')
            .leftJoin('announcements as a',          'cp.id', 'a.id')
            .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
            .leftJoin('community_photos as p',       'cp.id', 'p.post_id')
            .leftJoin('recommendations_and_tips as rt',  'cp.id', 'rt.id')
            .leftJoin('volunteer_help_requests as vh',   'cp.id', 'vh.id');

        // When trending is involved (sort=trending OR view=trending) and the scored view exists, bring it in
        if (wantTrendingScore && hasTsView) {
            q = q
                .leftJoin('ll_trending_scores as ts', 'ts.post_id', 'cp.id')
                .where('ts.trending_score', '>', 0)
                .whereRaw('cp.posted_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hoursWindow]);
        } else if (wantTrendingScore && !hasTsView) {
            // fallback trending mode without the scored view: keep work bounded to the window
            q = q.whereRaw('cp.posted_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)', [hoursWindow]);
        }

        if (subtype) applySubtypeFilter(q, subtype);

        if (String(userParam).trim()) {
            const raw = String(userParam).trim();
            if (/^\d+$/.test(raw)) {
                q.andWhere('cp.user_id', Number(raw));
            } else {
                const handle = raw.replace(/^@/, '').toLowerCase();
                q.andWhereRaw('LOWER(u.handle) = ?', [handle]);
            }
        }

        if (viewParam === 'mine') {
            if (viewerId) q.andWhere('cp.user_id', viewerId);
            else q.whereRaw('1=0');
        } else if (viewParam === 'following') {
            if (!viewerId) {
                q.whereRaw('1=0');
            } else {
                const schema = await detectFollowSchema();
                if (schema) {
                    q.andWhereExists(function () {
                        this.select(db.raw('1'))
                            .from(`${schema.table} as f`)
                            .whereRaw(`f.\`${schema.follower}\` = ? AND f.\`${schema.following}\` = cp.user_id`, [viewerId]);
                    });
                } else {
                    q.whereRaw('1=0');
                }
            }
        }

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

        const hasVisibility = await db.schema.hasColumn('community_posts', 'visibility');
        if (hasVisibility) {
            const follow = await detectFollowSchema();
            q.andWhere(function () {
                this.whereNull('cp.visibility').orWhere('cp.visibility', 'public');
                if (viewerId && follow) {
                    this.orWhere(function () {
                        this.where('cp.visibility', 'followers').andWhereExists(function () {
                            this.select(db.raw('1'))
                                .from(`${follow.table} as f`)
                                .whereRaw(`f.\`${follow.follower}\` = ? AND f.\`${follow.following}\` = cp.user_id`, [viewerId]);
                        });
                    });
                }
            });
        }

        if (city.trim())   q.whereRaw('LOWER(cp.city)   = ?', city.trim().toLowerCase());
        if (county.trim()) q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());

        // Optional total count for pagination / footer display
        if (includeTotal) {
            try {
                const countQ = q.clone().clearSelect().clearOrder().clearGroup();
                const row = await countQ.countDistinct({ total: 'cp.id' }).first();
                const totalCount = Number(row?.total || 0);
                res.set('X-Total-Count', String(totalCount));
                res.set('Access-Control-Expose-Headers', 'X-Total-Count');
            } catch {
                res.set('X-Total-Count', '0');
                res.set('Access-Control-Expose-Headers', 'X-Total-Count');
            }
        }

        const select = [
            'cp.id',
            'cp.category',
            'cp.posted_at as posted_at',
            'cp.posted_at as date_created',
            'cp.latitude',
            'cp.longitude',
            db.raw('COALESCE(cp.title, "")        AS title'),
            db.raw('COALESCE(cp.description, "")  AS description'),
            db.raw('COALESCE(cp.city, "")         AS city'),
            db.raw('COALESCE(cp.county, "")       AS county'),
            db.raw('COALESCE(cp.street_address, "") AS street_address'),

            db.raw('ANY_VALUE(u.first_name) AS first_name'),
            db.raw('ANY_VALUE(u.last_name) AS last_name'),
            db.raw('COALESCE(ANY_VALUE(u.handle), "") AS handle'),
            db.raw('COALESCE(ANY_VALUE(u.avatar_url), "") AS avatar_url'),
            db.raw('COALESCE(ANY_VALUE(u.profile_picture), "") AS profile_picture'),

            db.raw('ANY_VALUE(cc.label) AS categoryLabel'),
            'ANY_VALUE(lf.lost_or_found)',
            'ANY_VALUE(lf.reward)',
            'ANY_VALUE(vh.help_type)',
            'ANY_VALUE(vh.request_kind)',
            'ANY_VALUE(vh.needed_date)',
            'ANY_VALUE(vh.contact)',
            db.raw('MAX(rt.rec_type) AS rec_type'),

            db.raw('COALESCE(JSON_ARRAYAGG(p.url), JSON_ARRAY()) AS photos'),

            db('post_likes')
                .count('*')
                .whereRaw('category = ? AND post_id = cp.id', ['community_post'])
                .as('likesCount'),

            db.raw(
                'EXISTS (SELECT 1 FROM post_likes WHERE category = ? AND post_id = cp.id AND user_id = ?) AS viewerLiked',
                ['community_post', viewerId],
            ),

            db('post_comments')
                .count('*')
                .whereRaw('post_id = cp.id')
                .as('commentsCount'),

            db('post_reposts')
                .count('*')
                .whereRaw('post_id = cp.id')
                .as('repostsCount'),
            db.raw(
                'EXISTS (SELECT 1 FROM post_reposts WHERE post_id = cp.id AND user_id = ?) AS viewerReposted',
                [viewerId],
            ),
        ];

        // Add a trending score when needed (view table or fallback)
        if (sort === 'trending' && hasTsView) {
            select.push(db.raw('COALESCE(MAX(ts.trending_score), 0) AS score'));
        } else if (wantTrendingScore && !hasTsView) {
            const windowSql = 'DATE_SUB(NOW(), INTERVAL ? HOUR)';
            select.push(
                db.raw(
                    `(
                      (
                        (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = cp.id AND pl.category='community_post' AND pl.created_at >= ${windowSql}) * 1.0
                      + (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = cp.id AND pc.created_at >= ${windowSql}) * 1.5
                      + (SELECT COUNT(*) FROM post_reposts  pr WHERE pr.post_id = cp.id AND pr.created_at >= ${windowSql}) * 2.0
                      - (SELECT COUNT(*) FROM post_flags    pf WHERE pf.post_id = cp.id AND pf.created_at >= ${windowSql}) * 2.0
                      ) * POW(0.5, GREATEST(TIMESTAMPDIFF(HOUR, cp.posted_at, NOW()), 0) / ?)
                    ) AS score`,
                    [hoursWindow, hoursWindow, hoursWindow, hoursWindow, halfLife]
                )
            );
        }

        q.groupBy('cp.id');

        if (wantTrendingScore && !hasTsView) {
            q.havingRaw('score > 0');
        }

        if (sort === 'popular') {
            q.orderBy('likesCount', 'desc').orderBy('cp.posted_at', 'desc');
        } else if (sort === 'trending') {
            q.orderBy('score', 'desc').orderBy('cp.posted_at', 'desc');
        } else {
            q.orderBy('cp.posted_at', 'desc');
        }

        const posts = await q.limit(limit).offset(offset).select(select);
        return res.json(posts);
    } catch (err) {
        return next(err);
    }
});

/* Create post --------------------------------------------------------------- */
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

/* Categories ---------------------------------------------------------------- */
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

/* GET /api/community/:id ----------------------------------------------------- */
router.get('/:id', optionalAuth, async (req, res, next) => {
    try {
        const postId = Number(req.params.id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const viewerId = req.user?.id || 0;

        let q = db('community_posts as cp')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_categories as cc',  'cp.category', 'cc.slug')
            .leftJoin('lost_and_found as lf',        'cp.id', 'lf.id')
            .leftJoin('announcements as a',          'cp.id', 'a.id')
            .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
            .leftJoin('community_photos as p',       'cp.id', 'p.post_id')
            .leftJoin('recommendations_and_tips as rt',  'cp.id', 'rt.id')
            .leftJoin('volunteer_help_requests as vh',   'cp.id', 'vh.id')
            .where('cp.id', postId);

        const select = [
            'cp.id',
            'cp.user_id',
            'cp.category',
            'cp.posted_at as posted_at',
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
            db.raw('COALESCE(u.handle, "") AS handle'),
            db.raw('COALESCE(u.avatar_url, "") AS avatar_url'),
            db.raw('COALESCE(u.profile_picture, "") AS profile_picture'),

            db.raw('cc.label AS categoryLabel'),
            'lf.lost_or_found',
            'lf.reward',
            'vh.help_type',
            'vh.request_kind',
            'vh.needed_date',
            'vh.contact',
            db.raw('MAX(rt.rec_type) AS rec_type'),

            db.raw('COALESCE(JSON_ARRAYAGG(p.url), JSON_ARRAY()) AS photos'),

            db('post_likes').count('*').whereRaw('category = ? AND post_id = cp.id', ['community_post']).as('likesCount'),
            db('post_comments').count('*').whereRaw('post_id = cp.id').as('commentsCount'),
            db('post_reposts').count('*').whereRaw('post_id = cp.id').as('repostsCount'),

            db.raw(
                'EXISTS (SELECT 1 FROM post_likes WHERE category = ? AND post_id = cp.id AND user_id = ?) AS viewerLiked',
                ['community_post', viewerId],
            ),
            db.raw(
                'EXISTS (SELECT 1 FROM post_reposts WHERE post_id = cp.id AND user_id = ?) AS viewerReposted',
                [viewerId],
            ),

            db.raw('COALESCE(MAX(ts.trending_score), 0) AS score'),
        ];

        q = q.leftJoin('ll_trending_scores as ts', 'ts.post_id', 'cp.id');
        q.groupBy('cp.id');

        const row = await q.first(select);
        if (!row) return res.status(404).json({ message: 'Not found' });

        return res.json(row);
    } catch (err) {
        return next(err);
    }
});

/* ---------------------------------------------------------------------------
 * Comments (threaded)
 * Endpoints:
 *  - GET  /api/community/:id/comments
 *  - POST /api/community/:id/comments
 *  - Alias: /api/community/posts/:id/comments (for older clients)
 *  - POST /api/community/comments (legacy body-based endpoint)
 *  - POST /api/community/comments/:commentId/like
 *  - POST /api/community/comments/:commentId/flag
 * ------------------------------------------------------------------------- */

const COMMENT_MAX_CHARS = 15000;

let HAS_COMMENT_FLAGS_TABLE = undefined; // boolean
async function hasCommentFlagsTable() {
    if (HAS_COMMENT_FLAGS_TABLE !== undefined) return HAS_COMMENT_FLAGS_TABLE;
    const hasTable = await db.schema.hasTable('comment_flags');
    if (!hasTable) {
        HAS_COMMENT_FLAGS_TABLE = false;
        return HAS_COMMENT_FLAGS_TABLE;
    }
    const [hasCommentId, hasUserId] = await Promise.all([
        db.schema.hasColumn('comment_flags', 'comment_id'),
        db.schema.hasColumn('comment_flags', 'user_id'),
    ]);
    HAS_COMMENT_FLAGS_TABLE = !!hasCommentId && !!hasUserId;
    return HAS_COMMENT_FLAGS_TABLE;
}

function parseOptionalId(v) {
    if (v === null || typeof v === 'undefined') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function extractCommentContent(body) {
    const raw =
        body?.content ??
        body?.text ??
        body?.body ??
        body?.comment ??
        '';
    return String(raw).trim().slice(0, COMMENT_MAX_CHARS);
}

async function createPostComment({ postId, userId, content, parentId }) {
    return db.transaction(async (trx) => {
        let rootId = null;
        let parentRow = null;

        if (Number.isFinite(parentId) && parentId) {
            parentRow = await trx('post_comments')
                .select('id', 'post_id', 'root_id')
                .where({ id: parentId })
                .first();

            if (!parentRow) {
                const e = new Error('Parent comment not found');
                e.status = 404;
                throw e;
            }
            if (Number(parentRow.post_id) !== Number(postId)) {
                const e = new Error('Parent comment does not belong to this post');
                e.status = 400;
                throw e;
            }
            rootId = parentRow.root_id || parentRow.id;
        }

        const insert = {
            post_id: postId,
            user_id: userId,
            content,
            parent_id: Number.isFinite(parentId) && parentId ? parentId : null,
            root_id: rootId,
            created_at: trx.fn.now(),
        };

        const [cid] = await trx('post_comments').insert(insert);

        // If top-level comment, set root_id = id
        if (!insert.parent_id) {
            await trx('post_comments').where({ id: cid }).update({ root_id: cid });
            rootId = cid;
        } else {
            // Track reply counts (best-effort)
            await trx('post_comments')
                .where({ id: insert.parent_id })
                .update({ reply_count: trx.raw('reply_count + 1') });

            if (rootId && rootId !== insert.parent_id) {
                await trx('post_comments')
                    .where({ id: rootId })
                    .update({ reply_count: trx.raw('reply_count + 1') });
            }
        }

        const u = await trx('users')
            .select('first_name', 'last_name', 'handle', 'avatar_url', 'profile_picture', 'public_id')
            .where({ id: userId })
            .first();

        return {
            id: cid,
            post_id: postId,
            user_id: userId,
            parent_id: insert.parent_id,
            root_id: rootId,
            reply_count: 0,
            created_at: new Date().toISOString(),
            content,
            text: content,

            first_name: u?.first_name || '',
            last_name: u?.last_name || '',
            handle: u?.handle || '',
            avatar_url: u?.avatar_url || '',
            profile_picture: u?.profile_picture || '',
            public_id: u?.public_id ?? null,

            likes: 0,
            viewer_liked: false,
            viewer_flagged: false,
        };
    });
}

async function handleCreateComment(req, res, next) {
    try {
        const postId = Number(req.params.id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const content = extractCommentContent(req.body);
        if (!content) return res.status(400).json({ message: 'Comment text required' });

        const parentId = parseOptionalId(req.body?.parent_id ?? req.body?.parentId);

        const created = await createPostComment({
            postId,
            userId: req.user.id,
            content,
            parentId,
        });

        return res.status(201).json(created);
    } catch (err) {
        return next(err);
    }
}

async function handleGetComments(req, res, next) {
    try {
        const postId = Number(req.params.id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const viewerId = req.user?.id || 0;
        const flagsEnabled = await hasCommentFlagsTable();

        const select = [
            'pc.id',
            'pc.post_id',
            'pc.user_id',
            'pc.parent_id',
            'pc.root_id',
            'pc.reply_count',
            'pc.created_at',
            db.raw('pc.content AS content'),
            db.raw('pc.content AS text'),

            'u.first_name',
            'u.last_name',
            db.raw('COALESCE(u.handle, "") AS handle'),
            db.raw('COALESCE(u.avatar_url, "") AS avatar_url'),
            db.raw('COALESCE(u.profile_picture, "") AS profile_picture'),
            db.raw('COALESCE(u.public_id, NULL) AS public_id'),

            db('comment_likes')
                .count('*')
                .whereRaw('comment_id = pc.id')
                .as('likes'),

            db.raw(
                'EXISTS (SELECT 1 FROM comment_likes cl WHERE cl.comment_id = pc.id AND cl.user_id = ?) AS viewer_liked',
                [viewerId]
            ),
        ];

        if (flagsEnabled) {
            select.push(
                db.raw(
                    'EXISTS (SELECT 1 FROM comment_flags cf WHERE cf.comment_id = pc.id AND cf.user_id = ?) AS viewer_flagged',
                    [viewerId]
                )
            );
        } else {
            select.push(db.raw('FALSE AS viewer_flagged'));
        }

        const rows = await db('post_comments as pc')
            .join('users as u', 'pc.user_id', 'u.id')
            .select(select)
            .where('pc.post_id', postId)
            .orderBy('pc.created_at', 'asc');

        return res.json(rows);
    } catch (err) {
        return next(err);
    }
}

/* GET /api/community/:id/comments ------------------------------------------ */
router.get('/:id/comments', optionalAuth, handleGetComments);

/* GET /api/community/posts/:id/comments (alias) ---------------------------- */
router.get('/posts/:id/comments', optionalAuth, handleGetComments);

/* POST /api/community/:id/comments ----------------------------------------- */
router.post('/:id/comments', authenticateToken, handleCreateComment);

/* POST /api/community/posts/:id/comments (alias) --------------------------- */
router.post('/posts/:id/comments', authenticateToken, handleCreateComment);

/* POST /api/community/comments (legacy) ------------------------------------ */
router.post('/comments', authenticateToken, async (req, res, next) => {
    try {
        const postId = Number(req.body?.postId ?? req.body?.post_id);
        if (!Number.isFinite(postId)) return res.status(400).json({ message: 'Invalid post id' });

        const content = extractCommentContent(req.body);
        if (!content) return res.status(400).json({ message: 'Comment text required' });

        const parentId = parseOptionalId(req.body?.parent_id ?? req.body?.parentId);

        const created = await createPostComment({
            postId,
            userId: req.user.id,
            content,
            parentId,
        });

        return res.status(201).json(created);
    } catch (err) {
        return next(err);
    }
});

/* POST /api/community/comments/:commentId/like ------------------------------ */
router.post('/comments/:commentId/like', authenticateToken, async (req, res, next) => {
    try {
        const cid = Number(req.params.commentId);
        if (!Number.isFinite(cid)) return res.status(400).json({ message: 'Invalid comment id' });

        const existing = await db('comment_likes').where({ comment_id: cid, user_id: req.user.id }).first();
        if (existing) {
            await db('comment_likes').where({ comment_id: cid, user_id: req.user.id }).del();
        } else {
            await db('comment_likes').insert({ comment_id: cid, user_id: req.user.id });
        }
        const c = await db('comment_likes').where({ comment_id: cid }).count({ n: '*' }).first();
        return res.json({ liked: !existing, likes: Number(c?.n || 0) });
    } catch (err) {
        return next(err);
    }
});

/* POST /api/community/comments/:commentId/flag ------------------------------ */
router.post('/comments/:commentId/flag', authenticateToken, async (req, res, next) => {
    try {
        const cid = Number(req.params.commentId);
        if (!Number.isFinite(cid)) return res.status(400).json({ message: 'Invalid comment id' });

        const enabled = await hasCommentFlagsTable();
        if (!enabled) return res.status(501).json({ message: 'Comment reporting is not configured' });

        const ALLOWED = new Set(['spam','harassment','hate','nudity','misinformation','illegal','other']);
        const reason = String(req.body?.reason || 'other').toLowerCase().slice(0, 50);
        if (!ALLOWED.has(reason)) return res.status(400).json({ message: 'Invalid reason' });
        const details = String(req.body?.details || '').slice(0, 2000);

        await db.raw(
            'INSERT INTO comment_flags (comment_id,user_id,reason,details) VALUES (?,?,?,?) ' +
            'ON DUPLICATE KEY UPDATE reason=VALUES(reason), details=VALUES(details), created_at=NOW()',
            [cid, req.user.id, reason, details]
        );

        return res.json({ flagged: true, reason });
    } catch (err) {
        return next(err);
    }
});

export default router;
