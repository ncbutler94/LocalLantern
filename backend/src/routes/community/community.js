// backend/src/routes/community/community.js
/* ---------------------------------------------------------------------------
 * Community feed + details + comments
 * Added 2025‑11‑19: GET /trending  (windowed, time‑decayed score)
 * 2025‑11‑19 UPDATE: /trending now prefers SQL views (ll_trending_scores)
 * 2025‑11‑19 UPDATE: /trending/summary — returns category counts by location
 * 2025‑11‑19 UPDATE: GET / (feed) now supports sort=trending
 * ------------------------------------------------------------------------- */

import express           from 'express';
import multer            from 'multer';
import { Storage }        from '@google-cloud/storage';
import db                from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';
import optionalAuth      from '../../middleware/optionalAuth.js';

const router = express.Router();

/* Pagination defaults / hard limits */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 500;

/* ─────────── GCS uploads (used for PATCH photo updates) ─────────── */
const gcsStorage = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const gcsBucket  = gcsStorage.bucket(process.env.GCS_BUCKET);
const upload     = multer({ storage: multer.memoryStorage() });

// Accept multiple common field names used by different clients when editing a post.
// (Some clients send `photo`/`images`/`files` instead of `photos`.)
const uploadEditPhotos = upload.fields([
    { name: 'photos', maxCount: 12 },
    { name: 'photo', maxCount: 12 },
    { name: 'images', maxCount: 12 },
    { name: 'files', maxCount: 12 },
]);

function flattenMulterFiles(req) {
    // multer .array()   -> req.files = File[]
    // multer .fields()  -> req.files = { fieldName: File[] }
    // multer .single()  -> req.file  = File
    const out = [];

    if (Array.isArray(req?.files)) {
        return req.files;
    }

    if (req?.files && typeof req.files === 'object') {
        Object.values(req.files).forEach((arr) => {
            if (Array.isArray(arr)) out.push(...arr);
        });
    }

    if (req?.file) out.push(req.file);

    return out;
}


function safeFileName(name) {
    const raw = String(name || 'photo').trim() || 'photo';
    return raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function folderForCategory(category) {
    const c = String(category || '').trim().toLowerCase();

    // Announcements
    if (c === 'announcement' || c === 'announcements') return 'community/announcements';

    // Discussions
    if (c === 'general-discussion' || c === 'discussion') return 'community/general-discussion';

    // Lost & Found
    if (c === 'lost-and-found' || c === 'lost-found') return 'community/lost-and-found';

    // Public Safety
    if (c === 'public-safety-alerts') return 'community/public-safety';

    // Recommendations (tips removed; keep legacy folder name for continuity)
    if (c === 'recommendations' || c === 'recommendation' || c === 'recommendations-tips' || c === 'tips' || c === 'tip') {
        return 'community/recommendations-and-tips';
    }

    // Volunteer / Help (split categories in cp, unified folder)
    if (c === 'help-requests' || c === 'help_requests' || c === 'volunteer-requests' || c === 'volunteers' || c === 'volunteer' ||
        c === 'volunteer-help-requests' || c === 'volunteer-help' || c === 'volunteer_help_requests') {
        return 'community/volunteer-and-help-requests';
    }

    return 'community/misc';
}

function maxPhotosForCategory(category) {
    // Unified limit across all Community post types (front-end enforces 10 too).
    // Keeping this server-side cap prevents accidental oversized uploads.
    const c = String(category || '').trim().toLowerCase();
    if (!c) return 10;
    return 10;
}

function parseJsonArray(val) {
    if (Array.isArray(val)) return val;
    const s = String(val || '').trim();
    if (!s) return null;
    try {
        const parsed = JSON.parse(s);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}


function normalizeMySqlDateTime(input) {
    // Accepts: ISO strings (with/without Z), MySQL datetime strings, Date objects, or empty.
    // Returns: Date object (preferred for knex/mysql2) or null.
    if (input === null || typeof input === 'undefined') return null;

    if (input instanceof Date) {
        // Invalid dates become NaN
        return Number.isNaN(input.getTime()) ? null : input;
    }

    const s = String(input).trim();
    if (!s) return null;

    // If it's already a MySQL DATETIME-ish string, try Date parse anyway (still works for 'YYYY-MM-DD HH:mm:ss')
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;

    return null;
}


let HAS_COMMUNITY_PHOTO_POSITION = undefined; // boolean
async function hasCommunityPhotoPosition() {
    if (HAS_COMMUNITY_PHOTO_POSITION !== undefined) return HAS_COMMUNITY_PHOTO_POSITION;
    try {
        const hasTable = await db.schema.hasTable('community_photos');
        if (!hasTable) {
            HAS_COMMUNITY_PHOTO_POSITION = false;
            return HAS_COMMUNITY_PHOTO_POSITION;
        }
        const hasCol = await db.schema.hasColumn('community_photos', 'position');
        HAS_COMMUNITY_PHOTO_POSITION = Boolean(hasCol);
        return HAS_COMMUNITY_PHOTO_POSITION;
    } catch {
        HAS_COMMUNITY_PHOTO_POSITION = false;
        return HAS_COMMUNITY_PHOTO_POSITION;
    }
}


function photosArrayAggSql(hasPos) {
    // Some MySQL versions do NOT support ORDER BY inside JSON_ARRAYAGG().
    // To guarantee cover-photo ordering (and stay compatible), build JSON using GROUP_CONCAT(JSON_QUOTE(...)) with ORDER BY,
    // then CAST the resulting string to JSON. If no rows, this yields '[]'.
    const orderCol = hasPos ? 'p2.position' : 'p2.id';
    return `COALESCE(
        CAST(
            CONCAT(
                '[',
                IFNULL(
                    (SELECT GROUP_CONCAT(JSON_QUOTE(p2.url) ORDER BY ${orderCol} SEPARATOR ',')
                     FROM community_photos p2
                     WHERE p2.post_id = cp.id),
                    ''
                ),
                ']'
            ) AS JSON
        ),
        JSON_ARRAY()
    ) AS photos`;
}



async function uploadFilesToGcs(files, folderPrefix) {
    const list = Array.isArray(files) ? files : [];
    if (!list.length) return [];

    const uploaded = [];

    for (const file of list) {
        if (!file || !file.buffer) continue;
        const safe = safeFileName(file.originalname);
        const gcsName = `${folderPrefix}/${Date.now()}_${safe}`;
        const blob = gcsBucket.file(gcsName);
        const stream = blob.createWriteStream({
            resumable: false,            metadata: { contentType: file.mimetype },
        });

        // eslint-disable-next-line no-await-in-loop
        const url = await new Promise((resolve, reject) => {
            stream
                .on('error', reject)
                .on('finish', () =>
                    resolve(`https://storage.googleapis.com/${gcsBucket.name}/${gcsName}`)
                );
            stream.end(file.buffer);
        });

        uploaded.push(url);
    }

    return uploaded;
}


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


let CP_DATE_EXPR_SQL;

/**
 * Returns a SQL expression (string) representing the best available "post created" timestamp
 * for community_posts (aliased as `cp` in queries).
 * We prefer posted_at, then date_created, then created_at.
 */
async function getCommunityPostsDateExprSql(alias = 'cp') {
    if (alias === 'cp' && CP_DATE_EXPR_SQL) return CP_DATE_EXPR_SQL;

    const [hasPostedAt, hasDateCreated, hasCreatedAt] = await Promise.all([
        db.schema.hasColumn('community_posts', 'posted_at'),
        db.schema.hasColumn('community_posts', 'date_created'),
        db.schema.hasColumn('community_posts', 'created_at'),
    ]);

    const cols = [];
    if (hasPostedAt) cols.push(`${alias}.posted_at`);
    if (hasDateCreated) cols.push(`${alias}.date_created`);
    if (hasCreatedAt) cols.push(`${alias}.created_at`);

    // Fallback to posted_at if we can't detect (keeps behavior consistent with older builds)
    const expr = cols.length === 0 ? `${alias}.posted_at` : (cols.length === 1 ? cols[0] : `COALESCE(${cols.join(', ')})`);

    if (alias === 'cp') CP_DATE_EXPR_SQL = expr;
    return expr;
}

function applyDateRange(q, dateRange, dateExprSql = 'cp.posted_at') {
    const raw = String(dateRange || 'all').trim().toLowerCase();
    if (!raw || raw === 'all' || raw === 'all time' || raw === 'all-time') return;

    // Normalize common UI labels
    // Examples: 'Past 24h', 'Past 24H', 'past24h', 'last 24 hours'
    const dr = raw
        .replace(/_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const is24h =
        dr === '24h' ||
        dr === 'past 24h' ||
        dr === 'past 24 h' ||
        dr === 'last 24h' ||
        dr === 'last 24 h' ||
        dr === 'past day' ||
        dr === 'last day' ||
        dr === '24 hours' ||
        dr === 'last 24 hours' ||
        dr === 'past 24 hours';

    const is7d =
        dr === '7d' ||
        dr === 'past week' ||
        dr === 'last week' ||
        dr === 'week' ||
        dr === '7 days' ||
        dr === 'last 7 days' ||
        dr === 'past 7 days';

    const is30d =
        dr === '30d' ||
        dr === 'past month' ||
        dr === 'last month' ||
        dr === 'month' ||
        dr === '30 days' ||
        dr === 'last 30 days' ||
        dr === 'past 30 days';

    if (is24h) {
        q.andWhereRaw(`${dateExprSql} >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`);
        return;
    }
    if (is7d) {
        q.andWhereRaw(`${dateExprSql} >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
        return;
    }
    if (is30d) {
        q.andWhereRaw(`${dateExprSql} >= DATE_SUB(NOW(), INTERVAL 30 DAY)`);
        return;
    }

    // unknown value -> ignore
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

    // Recommendations (tips merged into recommendations; legacy slugs supported)
    if (
        sub === 'recommendations' ||
        sub === 'recommendation' ||
        sub === 'recommendations-tips' ||
        sub === 'tips' ||
        sub === 'tip'
    ) {
        qb.andWhere(function () {
            this.whereIn('cp.category', ['recommendations', 'recommendations-tips', 'tips', 'tip']);
        });
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


    // Lost & Found (legacy slug support)
    if (sub === 'lost-and-found' || sub === 'lost-found') {
        qb.andWhere(function () {
            this.whereIn('cp.category', ['lost-and-found', 'lost-found']);
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

    const postId = payload?.post_id ?? payload?.postId;
    const userId = payload?.user_id ?? payload?.userId ?? payload?.editor_user_id ?? payload?.editorUserId;
    const snapshotJson =
        payload?.snapshot_json ??
        payload?.snapshotJson ??
        payload?.snapshot_json_str ??
        payload?.snapshot ??
        payload?.data_json ??
        payload?.data ??
        null;

    if (!Number.isFinite(Number(postId)) || !snapshotJson) return;

    const hasCol = async (col) => {
        try {
            return await trx.schema.hasColumn('community_post_edits', col);
        } catch {
            return false;
        }
    };

    const [
        hasEditedAt,
        hasCreatedAt,
        hasSnapshotJson,
        hasSnapshot,
        hasDataJson,
        hasData,
        hasUserId,
        hasEditorUserId,
        hasAction,
        hasVersion,
    ] = await Promise.all([
        hasCol('edited_at'),
        hasCol('created_at'),
        hasCol('snapshot_json'),
        hasCol('snapshot'),
        hasCol('data_json'),
        hasCol('data'),
        hasCol('user_id'),
        hasCol('editor_user_id'),
        hasCol('action'),
        hasCol('version'),
    ]);

    const row = { post_id: Number(postId) };

    if (hasEditorUserId && Number.isFinite(Number(userId))) row.editor_user_id = Number(userId);
    else if (hasUserId && Number.isFinite(Number(userId))) row.user_id = Number(userId);

    if (hasAction) row.action = String(payload?.action || 'edit').slice(0, 32);

    if (hasEditedAt) row.edited_at = trx.fn.now();
    else if (hasCreatedAt) row.created_at = trx.fn.now();

    if (hasVersion) {
        try {
            const r = await trx('community_post_edits')
                .where({ post_id: Number(postId) })
                .max({ m: 'version' })
                .first();
            const current = Number(r?.m);
            row.version = Number.isFinite(current) ? current + 1 : 1;
        } catch {
            row.version = 1;
        }
    }

    if (hasSnapshotJson) row.snapshot_json = String(snapshotJson);
    else if (hasSnapshot) row.snapshot = String(snapshotJson);
    else if (hasDataJson) row.data_json = String(snapshotJson);
    else if (hasData) row.data = String(snapshotJson);

    try {
        await trx('community_post_edits').insert(row);
    } catch {
        // fallback attempts for older schemas
        const attempts = [
            { post_id: Number(postId), ...(Number.isFinite(Number(userId)) ? { user_id: Number(userId) } : {}), snapshot_json: String(snapshotJson) },
            { post_id: Number(postId), ...(Number.isFinite(Number(userId)) ? { user_id: Number(userId) } : {}), snapshot: String(snapshotJson) },
            { post_id: Number(postId), ...(Number.isFinite(Number(userId)) ? { user_id: Number(userId) } : {}), data_json: String(snapshotJson) },
            { post_id: Number(postId), ...(Number.isFinite(Number(userId)) ? { user_id: Number(userId) } : {}), data: String(snapshotJson) },
        ];
        for (let i = 0; i < attempts.length; i += 1) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await trx('community_post_edits').insert(attempts[i]);
                return;
            } catch {
                // try next
            }
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
        .leftJoin('volunteer_help_requests as vh', 'cp.id', 'vh.id')
        .leftJoin('ll_trending_scores as ts', 'ts.post_id', 'cp.id')
        .where('cp.id', postId);

    const hasPos = await hasCommunityPhotoPosition();

    const select = [
        'cp.id',
        'cp.user_id',
        'cp.category',



        db.raw('ANY_VALUE(cp.user_id)       AS user_id'),
        db.raw('ANY_VALUE(cp.edited_at)     AS edited_at'),
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
        'vh.help_type_other',
        'vh.request_kind',
        db.raw('COALESCE(ANY_VALUE(vh.is_urgent), 0) AS is_urgent'),
        db.raw(photosArrayAggSql(hasPos)),
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

        const isAdmin = Boolean(
            req.user?.is_admin ||
            req.user?.isAdmin ||
            String(req.user?.role || '').toLowerCase() === 'admin' ||
            String(req.user?.account_type || '').toLowerCase() === 'admin'
        );

        // Privacy: only the post owner (or an admin) can view edit history.
        if (!isAdmin && Number(post.user_id) !== Number(req.user.id)) {
            return res.status(403).json({ message: 'Not allowed' });
        }

        const enabled = await hasPostEditsTable();
        if (!enabled) return res.json([]);

        const editorCol = (await db.schema.hasColumn('community_post_edits', 'editor_user_id'))
            ? 'editor_user_id'
            : (await db.schema.hasColumn('community_post_edits', 'user_id'))
                ? 'user_id'
                : null;

        const tsCol = (await db.schema.hasColumn('community_post_edits', 'edited_at'))
            ? 'edited_at'
            : (await db.schema.hasColumn('community_post_edits', 'created_at'))
                ? 'created_at'
                : null;

        const hasVersion = await db.schema.hasColumn('community_post_edits', 'version');
        const hasAction = await db.schema.hasColumn('community_post_edits', 'action');

        const snapCol = (await db.schema.hasColumn('community_post_edits', 'snapshot_json'))
            ? 'snapshot_json'
            : (await db.schema.hasColumn('community_post_edits', 'snapshot'))
                ? 'snapshot'
                : (await db.schema.hasColumn('community_post_edits', 'data_json'))
                    ? 'data_json'
                    : (await db.schema.hasColumn('community_post_edits', 'data'))
                        ? 'data'
                        : null;

        let q = db('community_post_edits as e')
            .where('e.post_id', postId)
            .limit(50);

        if (editorCol) {
            q = q.leftJoin('users as u', `e.${editorCol}`, 'u.id');
        }

        const selectCols = [
            'e.id',
            'e.post_id',
            ...(hasVersion ? ['e.version'] : []),
            ...(hasAction ? ['e.action'] : []),
            ...(tsCol ? [`e.${tsCol} as edited_at`] : []),
            ...(snapCol ? [`e.${snapCol} as snapshot_raw`] : []),
            ...(editorCol ? [db.raw('COALESCE(u.handle, "") AS editor_handle')] : []),
        ];

        q = q.select(selectCols);

        if (tsCol) q = q.orderBy(`e.${tsCol}`, 'desc');
        else q = q.orderBy('e.id', 'desc');

        const rows = await q;

        const out = rows.map((r, idx) => {
            let parsed = {};
            const raw = r.snapshot_raw;
            if (raw) {
                try {
                    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                } catch {
                    parsed = {};
                }
            }

            // normalize {before, after} snapshots into a flattened snapshot (after overrides before)
            let snap = parsed;
            if (parsed && typeof parsed === 'object' && (parsed.before || parsed.after)) {
                const before = parsed.before && typeof parsed.before === 'object' ? parsed.before : {};
                const after = parsed.after && typeof parsed.after === 'object' ? parsed.after : {};
                snap = { ...before, ...after };
            }

            const version = Number.isFinite(Number(r.version)) ? Number(r.version) : idx + 1;

            return {
                id: r.id,
                post_id: r.post_id,
                version,
                action: r.action || 'edit',
                edited_at: r.edited_at || null,
                editor_handle: r.editor_handle || '',
                snapshot: snap && typeof snap === 'object' ? snap : {},
            };
        });

        return res.json(out);
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
router.patch(
    '/:id',
    authenticateToken,
    uploadEditPhotos,
    express.json({ limit: '2mb' }),
    async (req, res, next) => {
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

            const setIfFloat = async (col) => {
                if (!Object.prototype.hasOwnProperty.call(body, col)) return;
                const hasCol = await db.schema.hasColumn('community_posts', col);
                if (!hasCol) return;
                const raw = String(body[col] ?? '').trim();
                if (!raw) {
                    updates[col] = null;
                    return;
                }
                const n = Number(raw);
                updates[col] = Number.isFinite(n) ? n : null;
            };

            await setIfString('title', 120);
            await setIfString('description', 5000);
            await setIfString('city', 120);
            await setIfString('county', 120);
            await setIfString('street_address', 255);
            await setIfString('visibility', 20);
            await setIfFloat('latitude');
            await setIfFloat('longitude');

            const hasEditedAt = await hasCommunityPostsEditedAt();
            if (hasEditedAt) updates.edited_at = db.fn.now();

            const maxPhotos = maxPhotosForCategory(post.category);
            const wantsPhotoOrder =
                Object.prototype.hasOwnProperty.call(body, 'photo_order') ||
                Object.prototype.hasOwnProperty.call(body, 'photoOrder');

            const wantsPhotosArray = Object.prototype.hasOwnProperty.call(body, 'photos');

            const photoOrder = parseJsonArray(body.photo_order) || parseJsonArray(body.photoOrder);

            // Upload any new photos (multipart)
            const files = flattenMulterFiles(req);
            const folder = folderForCategory(post.category);
            const newUrls = await uploadFilesToGcs(files, folder);

            // Get current URLs (used for fallback ordering)
            let currentUrls = [];
            try {
                const hasTable = await db.schema.hasTable('community_photos');
                if (hasTable) {
                    const hasPos = await db.schema.hasColumn('community_photos', 'position');
                    const q = db('community_photos').where({ post_id: postId }).select('url');
                    if (hasPos) q.orderBy('position', 'asc');
                    currentUrls = (await q).map((r) => String(r.url || '').trim()).filter(Boolean);
                }
            } catch {
                currentUrls = [];
            }

            let finalPhotoUrls = null;

            if (photoOrder && (photoOrder.length || wantsPhotoOrder)) {
                const out = [];
                for (const tokenRaw of photoOrder) {
                    const token = String(tokenRaw || '').trim();
                    if (!token) continue;

                    if (token.startsWith('__new__:')) {
                        const idx = Number(token.slice(7));
                        if (Number.isFinite(idx) && newUrls[idx]) out.push(newUrls[idx]);
                        continue;
                    }

                    // treat as existing URL
                    out.push(token);
                }
                // If any new uploads weren't referenced, append them (best effort)
                for (let i = 0; i < newUrls.length; i += 1) {
                    const u = newUrls[i];
                    if (!out.includes(u)) out.push(u);
                }

                finalPhotoUrls = out.filter(Boolean).slice(0, maxPhotos);
            } else if (wantsPhotosArray && Array.isArray(body.photos) && newUrls.length === 0) {
                // Legacy JSON path: replace with provided URLs
                finalPhotoUrls = body.photos
                    .map((u) => String(u || '').trim())
                    .filter(Boolean)
                    .slice(0, maxPhotos);
            } else if (newUrls.length) {
                // New uploads but no order specified: append to existing (or provided list)
                const baseList = Array.isArray(body.photos)
                    ? body.photos.map((u) => String(u || '').trim()).filter(Boolean)
                    : currentUrls;
                finalPhotoUrls = [...baseList, ...newUrls].filter(Boolean).slice(0, maxPhotos);
            } else if (wantsPhotoOrder && (!photoOrder || photoOrder.length === 0)) {
                // Explicitly clearing photos via photo_order: []
                finalPhotoUrls = [];
            }

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
                // Recommendations / Tips (subtype table has no editable fields yet)
                if (await trx.schema.hasTable('recommendations')) {
                    const rtUp = {};
                    // Add subtype-specific editable fields here in the future.
                    if (Object.keys(rtUp).length) {
                        await trx('recommendations').where({ id: postId }).update(rtUp);
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
                        Object.prototype.hasOwnProperty.call(body, 'contact') &&
                        (await trx.schema.hasColumn('volunteer_help_requests', 'contact'))
                    ) {
                        vhUp.contact = String(body.contact || '').slice(0, 255);
                    }
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


// is_urgent flag (help requests). Accepts: 1/0, true/false, "urgent"/"flexible"/etc.
                    const urgentRaw =
                        Object.prototype.hasOwnProperty.call(body, 'is_urgent')
                            ? body.is_urgent
                            : (Object.prototype.hasOwnProperty.call(body, 'urgent') ? body.urgent : undefined);

                    if (urgentRaw !== undefined) {
                        const s = String(urgentRaw).trim().toLowerCase();
                        const boolVal =
                            s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on' || s === 'urgent';

                        if (await trx.schema.hasColumn('volunteer_help_requests', 'is_urgent')) {
                            vhUp.is_urgent = boolVal ? 1 : 0;
                        }
                        if (await trx.schema.hasColumn('volunteer_help_requests', 'urgent')) {
                            vhUp.urgent = boolVal ? 1 : 0;
                        }
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

                // Public Safety extra fields
                if (await trx.schema.hasTable('public_safety_alerts')) {
                    const psUp = {};
                    if (
                        Object.prototype.hasOwnProperty.call(body, 'expires_at') &&
                        (await trx.schema.hasColumn('public_safety_alerts', 'expires_at'))
                    ) {
                        const raw = String(body.expires_at || '').trim();
                        psUp.expires_at = raw ? normalizeMySqlDateTime(raw) : null;
                    }
                    if (Object.keys(psUp).length) {
                        await trx('public_safety_alerts').where({ id: postId }).update(psUp);
                    }
                }

                // Announcements legacy table
                if (await trx.schema.hasTable('announcements')) {
                    const aUp = {};
                    if (
                        Object.prototype.hasOwnProperty.call(body, 'title') &&
                        (await trx.schema.hasColumn('announcements', 'title'))
                    ) {
                        aUp.title = String(body.title || '').slice(0, 255);
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(body, 'description') &&
                        (await trx.schema.hasColumn('announcements', 'body'))
                    ) {
                        aUp.body = String(body.description || '').slice(0, 5000);
                    }
                    if (Object.keys(aUp).length) {
                        await trx('announcements').where({ id: postId }).update(aUp);
                    }
                }

                // Photos
                if (finalPhotoUrls !== null && (await trx.schema.hasTable('community_photos'))) {
                    const hasUrl = await trx.schema.hasColumn('community_photos', 'url');
                    const hasPostId = await trx.schema.hasColumn('community_photos', 'post_id');
                    const hasPos = await trx.schema.hasColumn('community_photos', 'position');
                    if (hasUrl && hasPostId) {
                        await trx('community_photos').where({ post_id: postId }).del();

                        const urls = finalPhotoUrls
                            .map((u) => String(u || '').trim())
                            .filter(Boolean)
                            .slice(0, maxPhotos);

                        if (urls.length) {
                            await trx('community_photos').insert(
                                urls.map((url, idx) => ({
                                    post_id: postId,
                                    url,
                                    ...(hasPos ? { position: idx } : {}),
                                }))
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
    }
);


// ALSO support PUT for clients that use axios.put() for edits
router.put(
    '/:id',
    authenticateToken,
    uploadEditPhotos,
    express.json({ limit: '2mb' }),
    async (req, res, next) => {
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

            const setIfFloat = async (col) => {
                if (!Object.prototype.hasOwnProperty.call(body, col)) return;
                const hasCol = await db.schema.hasColumn('community_posts', col);
                if (!hasCol) return;
                const raw = String(body[col] ?? '').trim();
                if (!raw) {
                    updates[col] = null;
                    return;
                }
                const n = Number(raw);
                updates[col] = Number.isFinite(n) ? n : null;
            };

            await setIfString('title', 120);
            await setIfString('description', 5000);
            await setIfString('city', 120);
            await setIfString('county', 120);
            await setIfString('street_address', 255);
            await setIfString('visibility', 20);
            await setIfFloat('latitude');
            await setIfFloat('longitude');

            const hasEditedAt = await hasCommunityPostsEditedAt();
            if (hasEditedAt) updates.edited_at = db.fn.now();

            const maxPhotos = maxPhotosForCategory(post.category);
            const wantsPhotoOrder =
                Object.prototype.hasOwnProperty.call(body, 'photo_order') ||
                Object.prototype.hasOwnProperty.call(body, 'photoOrder');

            const wantsPhotosArray = Object.prototype.hasOwnProperty.call(body, 'photos');

            const photoOrder = parseJsonArray(body.photo_order) || parseJsonArray(body.photoOrder);

            // Upload any new photos (multipart)
            const files = flattenMulterFiles(req);
            const folder = folderForCategory(post.category);
            const newUrls = await uploadFilesToGcs(files, folder);

            // Get current URLs (used for fallback ordering)
            let currentUrls = [];
            try {
                const hasTable = await db.schema.hasTable('community_photos');
                if (hasTable) {
                    const hasPos = await db.schema.hasColumn('community_photos', 'position');
                    const q = db('community_photos').where({ post_id: postId }).select('url');
                    if (hasPos) q.orderBy('position', 'asc');
                    currentUrls = (await q).map((r) => String(r.url || '').trim()).filter(Boolean);
                }
            } catch {
                currentUrls = [];
            }

            let finalPhotoUrls = null;

            if (photoOrder && (photoOrder.length || wantsPhotoOrder)) {
                const out = [];
                for (const tokenRaw of photoOrder) {
                    const token = String(tokenRaw || '').trim();
                    if (!token) continue;

                    if (token.startsWith('__new__:')) {
                        const idx = Number(token.slice(7));
                        if (Number.isFinite(idx) && newUrls[idx]) out.push(newUrls[idx]);
                        continue;
                    }

                    // treat as existing URL
                    out.push(token);
                }
                // If any new uploads weren't referenced, append them (best effort)
                for (let i = 0; i < newUrls.length; i += 1) {
                    const u = newUrls[i];
                    if (!out.includes(u)) out.push(u);
                }

                finalPhotoUrls = out.filter(Boolean).slice(0, maxPhotos);
            } else if (wantsPhotosArray && Array.isArray(body.photos) && newUrls.length === 0) {
                // Legacy JSON path: replace with provided URLs
                finalPhotoUrls = body.photos
                    .map((u) => String(u || '').trim())
                    .filter(Boolean)
                    .slice(0, maxPhotos);
            } else if (newUrls.length) {
                // New uploads but no order specified: append to existing (or provided list)
                const baseList = Array.isArray(body.photos)
                    ? body.photos.map((u) => String(u || '').trim()).filter(Boolean)
                    : currentUrls;
                finalPhotoUrls = [...baseList, ...newUrls].filter(Boolean).slice(0, maxPhotos);
            } else if (wantsPhotoOrder && (!photoOrder || photoOrder.length === 0)) {
                // Explicitly clearing photos via photo_order: []
                finalPhotoUrls = [];
            }

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
                // Recommendations / Tips (subtype table has no editable fields yet)
                if (await trx.schema.hasTable('recommendations')) {
                    const rtUp = {};
                    // Add subtype-specific editable fields here in the future.
                    if (Object.keys(rtUp).length) {
                        await trx('recommendations').where({ id: postId }).update(rtUp);
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
                        Object.prototype.hasOwnProperty.call(body, 'contact') &&
                        (await trx.schema.hasColumn('volunteer_help_requests', 'contact'))
                    ) {
                        vhUp.contact = String(body.contact || '').slice(0, 255);
                    }
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


// is_urgent flag (help requests). Accepts: 1/0, true/false, "urgent"/"flexible"/etc.
                    const urgentRaw =
                        Object.prototype.hasOwnProperty.call(body, 'is_urgent')
                            ? body.is_urgent
                            : (Object.prototype.hasOwnProperty.call(body, 'urgent') ? body.urgent : undefined);

                    if (urgentRaw !== undefined) {
                        const s = String(urgentRaw).trim().toLowerCase();
                        const boolVal =
                            s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'on' || s === 'urgent';

                        if (await trx.schema.hasColumn('volunteer_help_requests', 'is_urgent')) {
                            vhUp.is_urgent = boolVal ? 1 : 0;
                        }
                        if (await trx.schema.hasColumn('volunteer_help_requests', 'urgent')) {
                            vhUp.urgent = boolVal ? 1 : 0;
                        }
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

                // Public Safety extra fields
                if (await trx.schema.hasTable('public_safety_alerts')) {
                    const psUp = {};
                    if (
                        Object.prototype.hasOwnProperty.call(body, 'expires_at') &&
                        (await trx.schema.hasColumn('public_safety_alerts', 'expires_at'))
                    ) {
                        const raw = String(body.expires_at || '').trim();
                        psUp.expires_at = raw ? normalizeMySqlDateTime(raw) : null;
                    }
                    if (Object.keys(psUp).length) {
                        await trx('public_safety_alerts').where({ id: postId }).update(psUp);
                    }
                }

                // Announcements legacy table
                if (await trx.schema.hasTable('announcements')) {
                    const aUp = {};
                    if (
                        Object.prototype.hasOwnProperty.call(body, 'title') &&
                        (await trx.schema.hasColumn('announcements', 'title'))
                    ) {
                        aUp.title = String(body.title || '').slice(0, 255);
                    }
                    if (
                        Object.prototype.hasOwnProperty.call(body, 'description') &&
                        (await trx.schema.hasColumn('announcements', 'body'))
                    ) {
                        aUp.body = String(body.description || '').slice(0, 5000);
                    }
                    if (Object.keys(aUp).length) {
                        await trx('announcements').where({ id: postId }).update(aUp);
                    }
                }

                // Photos
                if (finalPhotoUrls !== null && (await trx.schema.hasTable('community_photos'))) {
                    const hasUrl = await trx.schema.hasColumn('community_photos', 'url');
                    const hasPostId = await trx.schema.hasColumn('community_photos', 'post_id');
                    const hasPos = await trx.schema.hasColumn('community_photos', 'position');
                    if (hasUrl && hasPostId) {
                        await trx('community_photos').where({ post_id: postId }).del();

                        const urls = finalPhotoUrls
                            .map((u) => String(u || '').trim())
                            .filter(Boolean)
                            .slice(0, maxPhotos);

                        if (urls.length) {
                            await trx('community_photos').insert(
                                urls.map((url, idx) => ({
                                    post_id: postId,
                                    url,
                                    ...(hasPos ? { position: idx } : {}),
                                }))
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
    }
);
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
// If comments exist, some schemas have dependent tables (likes/flags) with FK constraints.
// Delete those first to avoid "cannot delete" failures.
            try {
                const hasPostComments = await trx.schema.hasTable('post_comments');
                if (hasPostComments) {
                    const sub = trx('post_comments').select('id').where({ post_id: postId });

                    const safeDelWhereIn = async (table, col) => {
                        try {
                            const exists = await trx.schema.hasTable(table);
                            if (!exists) return;
                            await trx(table).whereIn(col, sub).del();
                        } catch {
                            // ignore
                        }
                    };

                    await safeDelWhereIn('comment_likes', 'comment_id');
                    await safeDelWhereIn('comment_flags', 'comment_id');
                    await safeDelWhereIn('post_comment_likes', 'comment_id');
                    await safeDelWhereIn('post_comment_flags', 'comment_id');
                }
            } catch {
                // ignore
            }

            await safeDel('post_comments', { post_id: postId });
            await safeDel('post_flags', { post_id: postId });

            await safeDel('lost_and_found', { id: postId });
            await safeDel('announcements', { id: postId });
            await safeDel('public_safety_alerts', { id: postId });
            await safeDel('recommendations', { id: postId });
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
            includeTotal: includeTotalQ = '0',
            dateRange: dateRangeQ = 'all',
            subtype = '',
            city = '',
            county = '',
            user: userParam = '',
            view: viewParamRaw = '',
            randomSeed: randomSeedQ = '',
        } = req.query;

        const viewParam = String(viewParamRaw || '').trim().toLowerCase();

        const limit  = Math.max(1, Math.min(Number(limitQ)  || DEFAULT_LIMIT, MAX_LIMIT));
        const offset = Math.max(0, Number(offsetQ) || 0);

        const viewerId = req.user?.id || 0;

        // Seed for stable pseudo-random ordering when sort=random (keeps paging consistent)
        const randomSeed = String(randomSeedQ || req.query.seed || req.user?.id || '').trim() || '0';
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

            // Detect optional columns for persistent "Marked as Found" + Edited badges
            const lfCols = await detectLostAndFoundResolveCols();
            const hasEditedAtCol = await hasCommunityPostsEditedAt();

            const dateExprSql = await getCommunityPostsDateExprSql('cp');

            const hasPos = await hasCommunityPhotoPosition();

            const select = [
                'cp.id',
                db.raw('ANY_VALUE(cp.user_id) AS user_id'),
                db.raw(`ANY_VALUE(${dateExprSql}) AS posted_at`),
                db.raw(`ANY_VALUE(${dateExprSql}) AS date_created`),
                ...(hasEditedAtCol ? [db.raw('ANY_VALUE(cp.edited_at) AS edited_at')] : [db.raw('NULL AS edited_at')]),
                'cp.category',


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
                ...(lfCols.resolved_at ? [db.raw('ANY_VALUE(lf.resolved_at) AS resolved_at')] : [db.raw('NULL AS resolved_at')]),
                ...(lfCols.resolved_message ? [db.raw('COALESCE(ANY_VALUE(lf.resolved_message), "") AS resolved_message')] : [db.raw('"" AS resolved_message')]),
                ...(lfCols.resolved_by_user_id ? [db.raw('ANY_VALUE(lf.resolved_by_user_id) AS resolved_by_user_id')] : [db.raw('NULL AS resolved_by_user_id')]),
                'vh.help_type',
                'vh.help_type_other',
                'vh.request_kind',
                db.raw('COALESCE(ANY_VALUE(vh.is_urgent), 0) AS is_urgent'),
                db.raw(photosArrayAggSql(hasPos)),

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
            q.orderBy('score', 'desc').orderByRaw(`${dateExprSql} DESC`);

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

        const hasPos = await hasCommunityPhotoPosition();

        const select = [
            'cp.id',
            db.raw(`ANY_VALUE(${dateExprSql}) AS posted_at`),
            db.raw(`ANY_VALUE(${dateExprSql}) AS date_created`),
            ...(hasEditedAtCol ? [db.raw('ANY_VALUE(cp.edited_at) AS edited_at')] : [db.raw('NULL AS edited_at')]),
            'cp.category',
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
            'vh.help_type_other',
            'vh.request_kind',
            db.raw('COALESCE(ANY_VALUE(vh.is_urgent), 0) AS is_urgent'),
            db.raw(photosArrayAggSql(hasPos)),

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

        // Add a trending score when Trending is requested (either View=Trending or sort=trending)
        if (wantsTrending && hasTsView) {
            select.push(db.raw('COALESCE(MAX(ts.trending_score), 0) AS score'));
        } else if (wantsTrending && !hasTsView) {
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

        if (sortMode === 'popular') {
            q.orderBy('likesCount', 'desc').orderByRaw(`${dateExprSql} DESC`);
        } else if (sortMode === 'trending') {
            q.orderBy('score', 'desc').orderByRaw(`${dateExprSql} DESC`);
        } else if (sortMode === 'random') {
            // Stable pseudo-random ordering for paging
            q.orderByRaw('MD5(CONCAT(cp.id, ?))', [randomSeed]).orderBy('cp.id', 'asc');
        } else {
            q.orderByRaw(`${dateExprSql} DESC`);
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

                WHEN LOWER(cp.category) IN ('recommendations-tips', 'recommendations', 'recommendation', 'tips', 'tip') THEN 'recommendations'

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

                WHEN LOWER(cp.category) IN ('recommendations-tips', 'recommendations', 'recommendation', 'tips', 'tip') THEN 'Recommendations'

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
            sort = 'newest',               // 'newest' | 'popular' | 'trending' | 'random'
            randomSeed: randomSeedQ = '',
            city = '',
            county = '',
            user: userParam = '',
            window: win = '48h',           // used when sort=trending and no view table
            halfLife: halfLifeQ = '36',    // used when sort=trending and no view table
            dateRange: dateRangeQ = 'all',
            limit: limitQ = DEFAULT_LIMIT,
            offset: offsetQ = 0,
            includeTotal: includeTotalQ = '0',
        } = req.query;

        const viewParam = String(req.query.view || req.query.selectedView || '').trim().toLowerCase();

        const includeTotal = ['1', 'true', 'yes'].includes(String(includeTotalQ || '').trim().toLowerCase());
        const isTrendingView = viewParam === 'trending';

        const sortNorm = String(sort || 'newest').trim().toLowerCase();
        const sortMode = (sortNorm === 'popular' || sortNorm === 'trending' || sortNorm === 'random') ? sortNorm : 'newest';

        // Stable random order (important for paging). Frontend should pass randomSeed when sort=random.
        const wantsTrending = isTrendingView || sortMode === 'trending';

        const limit = Math.max(1, Math.min(Number(limitQ) || DEFAULT_LIMIT, MAX_LIMIT));
        const offset = Math.max(0, Number(offsetQ) || 0);

        const viewerId = req.user?.id || 0;

        const randomSeed = String(randomSeedQ || req.query.seed || req.user?.id || '').trim() || '0';

        const hasTsView = await db.schema.hasTable('ll_trending_scores');
        const hoursWindow = parseWindowToHours(win);
        const halfLife = Math.max(6, Math.min(24 * 14, Number(halfLifeQ) || 36));
        const dateExprSql = await getCommunityPostsDateExprSql('cp');

        // Live-computed fallback trending score (used when ll_trending_scores exists but is empty/stale).
        // This keeps the Trending summary (which can fall back) consistent with the feed list.
        const TRENDING_WINDOW_SQL = 'DATE_SUB(NOW(), INTERVAL ? HOUR)';
        const TRENDING_FALLBACK_SCORE_SQL = `(
            (
                (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = cp.id AND pl.category='community_post' AND pl.created_at >= ${TRENDING_WINDOW_SQL}) * 1.0
              + (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = cp.id AND pc.created_at >= ${TRENDING_WINDOW_SQL}) * 1.5
              + (SELECT COUNT(*) FROM post_reposts  pr WHERE pr.post_id = cp.id AND pr.created_at >= ${TRENDING_WINDOW_SQL}) * 2.0
              - (SELECT COUNT(*) FROM post_flags    pf WHERE pf.post_id = cp.id AND pf.created_at >= ${TRENDING_WINDOW_SQL}) * 2.0
            ) * POW(0.5, GREATEST(TIMESTAMPDIFF(HOUR, ${dateExprSql}, NOW()), 0) / ?)
        )`;
        const TRENDING_FALLBACK_SCORE_BINDINGS = [hoursWindow, hoursWindow, hoursWindow, hoursWindow, halfLife];


        let q = db('community_posts as cp')
            .join('users as u', 'cp.user_id', 'u.id')
            .leftJoin('community_categories as cc', 'cp.category', 'cc.slug')
            .leftJoin('lost_and_found as lf', 'cp.id', 'lf.id')
            .leftJoin('announcements as a', 'cp.id', 'a.id')
            .leftJoin('public_safety_alerts as psa', 'cp.id', 'psa.id')
            .leftJoin('community_photos as p', 'cp.id', 'p.post_id')
            .leftJoin('volunteer_help_requests as vh', 'cp.id', 'vh.id');

        // When Trending is requested (either View=Trending or sort=trending) and the scored view exists, join it in.
        if (wantsTrending && hasTsView) {
            q = q.leftJoin('ll_trending_scores as ts', 'ts.post_id', 'cp.id');

            // Limit to the requested window.
            q.andWhereRaw(`${dateExprSql} >= DATE_SUB(NOW(), INTERVAL ? HOUR)`, [hoursWindow]);

            // IMPORTANT:
            // Some installs have ll_trending_scores but it can be empty/stale (materialized/refresh lag).
            // In that case, Trending summary can still show items (it falls back), but the feed would be empty.
            // Fix: allow either a precomputed score OR a live-computed score to qualify as trending.
            q.andWhereRaw(
                `(COALESCE(ts.trending_score, 0) > 0 OR ${TRENDING_FALLBACK_SCORE_SQL} > 0)`,
                TRENDING_FALLBACK_SCORE_BINDINGS
            );
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
            const stopWords = new Set(['the', 'for', 'an', 'a', 'and', 'of', 'to', 'in', 'on']);
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
                                .orWhere('u.last_name', 'like', `%${w}%`);
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

        applyDateRange(q, dateRangeQ, dateExprSql);

        if (city.trim()) q.whereRaw('LOWER(cp.city)   = ?', city.trim().toLowerCase());
        if (county.trim()) q.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());
        if (includeTotal) {
            try {
                let countQ = db('community_posts as cp')
                    .join('users as u', 'cp.user_id', 'u.id')
                    // These joins are required for split category filtering (Recommendations/Tips + Volunteer/Help)
                    .leftJoin('volunteer_help_requests as vh', 'cp.id', 'vh.id');

                if (wantsTrending && hasTsView) {
                    countQ = countQ
                        .leftJoin('ll_trending_scores as ts', 'ts.post_id', 'cp.id')
                        .andWhereRaw(`${dateExprSql} >= DATE_SUB(NOW(), INTERVAL ? HOUR)`, [hoursWindow])
                        .andWhereRaw(
                            `(COALESCE(ts.trending_score, 0) > 0 OR ${TRENDING_FALLBACK_SCORE_SQL} > 0)`,
                            TRENDING_FALLBACK_SCORE_BINDINGS
                        );
                }

                applyDateRange(countQ, dateRangeQ, dateExprSql);

                if (subtype) applySubtypeFilter(countQ, subtype);

                if (String(userParam).trim()) {
                    const raw = String(userParam).trim();
                    if (/^\d+$/.test(raw)) {
                        countQ.andWhere('cp.user_id', Number(raw));
                    } else {
                        const handle = raw.replace(/^@/, '').toLowerCase();
                        countQ.andWhereRaw('LOWER(u.handle) = ?', [handle]);
                    }
                }

                if (viewParam === 'mine') {
                    if (viewerId) countQ.andWhere('cp.user_id', viewerId);
                    else countQ.whereRaw('1=0');
                } else if (viewParam === 'following') {
                    if (!viewerId) {
                        countQ.whereRaw('1=0');
                    } else {
                        const schema = await detectFollowSchema();
                        if (schema) {
                            countQ.andWhereExists(function () {
                                this.select(db.raw('1'))
                                    .from(`${schema.table} as f`)
                                    .whereRaw(`f.\`${schema.follower}\` = ? AND f.\`${schema.following}\` = cp.user_id`, [viewerId]);
                            });
                        } else {
                            countQ.whereRaw('1=0');
                        }
                    }
                }

                const hasVisibility = await db.schema.hasColumn('community_posts', 'visibility');
                if (hasVisibility) {
                    const follow = await detectFollowSchema();
                    countQ.andWhere(function () {
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

                if (search.trim()) {
                    const stopWords = new Set(['the', 'for', 'an', 'a', 'and', 'of', 'to', 'in', 'on']);
                    const words = search
                        .trim().toLowerCase().split(/\s+/)
                        .filter((w) => w && !stopWords.has(w));

                    if (words.length) {
                        countQ.andWhere(function () {
                            words.forEach((w, i) => {
                                this[i ? 'orWhere' : 'where'](function () {
                                    this.where('cp.title', 'like', `%${w}%`)
                                        .orWhere('cp.description', 'like', `%${w}%`)
                                        .orWhere('u.first_name', 'like', `%${w}%`)
                                        .orWhere('u.last_name', 'like', `%${w}%`);
                                });
                            });
                        });
                    }
                }

                if (city.trim()) countQ.whereRaw('LOWER(cp.city)   = ?', city.trim().toLowerCase());
                if (county.trim()) countQ.whereRaw('LOWER(cp.county) = ?', county.trim().toLowerCase());

                if (wantsTrending && !hasTsView) {
                    res.set('X-Total-Count', '0');
                } else {
                    const row = await countQ.countDistinct({total: 'cp.id'}).first();
                    res.set('X-Total-Count', String(Number(row?.total || 0)));
                }
            } catch {
                res.set('X-Total-Count', '0');
            }
        }

// Detect optional Lost & Found resolve columns (for persistent "Marked as Found" on refresh)
        const lfCols = await detectLostAndFoundResolveCols();

// Detect optional edited_at column on community_posts
        const hasEditedAtCol = await hasCommunityPostsEditedAt();

        const hasPos = await hasCommunityPhotoPosition();

        const select = [
            'cp.id',
            db.raw('ANY_VALUE(cp.user_id) AS user_id'),
            db.raw(`ANY_VALUE(${dateExprSql}) AS posted_at`),
            db.raw(`ANY_VALUE(${dateExprSql}) AS date_created`),
            ...(hasEditedAtCol ? [db.raw('ANY_VALUE(cp.edited_at) AS edited_at')] : [db.raw('NULL AS edited_at')]),
            'cp.category',
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
            db.raw('ANY_VALUE(lf.lost_or_found) AS lost_or_found'),
            db.raw('ANY_VALUE(lf.reward) AS reward'),
            ...(lfCols.resolved_at ? [db.raw('ANY_VALUE(lf.resolved_at) AS resolved_at')] : [db.raw('NULL AS resolved_at')]),
            ...(lfCols.resolved_message ? [db.raw('COALESCE(ANY_VALUE(lf.resolved_message), "") AS resolved_message')] : [db.raw('"" AS resolved_message')]),
            ...(lfCols.resolved_by_user_id ? [db.raw('ANY_VALUE(lf.resolved_by_user_id) AS resolved_by_user_id')] : [db.raw('NULL AS resolved_by_user_id')]),
            db.raw('ANY_VALUE(vh.help_type) AS help_type'),
            db.raw('ANY_VALUE(vh.help_type_other) AS help_type_other'),
            db.raw('ANY_VALUE(vh.request_kind) AS request_kind'),
            db.raw('COALESCE(ANY_VALUE(vh.is_urgent), 0) AS is_urgent'),
            db.raw(photosArrayAggSql(hasPos)),

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
        if (wantsTrending && hasTsView) {
            // Use precomputed score when available; otherwise fall back to a live-computed score.
            select.push(db.raw(`COALESCE(MAX(ts.trending_score), ${TRENDING_FALLBACK_SCORE_SQL}) AS score`, TRENDING_FALLBACK_SCORE_BINDINGS));
        } else if (wantsTrending && !hasTsView) {
            const windowSql = 'DATE_SUB(NOW(), INTERVAL ? HOUR)';
            select.push(
                db.raw(
                    `(
                      (
                        (SELECT COUNT(*) FROM post_likes    pl WHERE pl.post_id = cp.id AND pl.category='community_post' AND pl.created_at >= ${windowSql}) * 1.0
                      + (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = cp.id AND pc.created_at >= ${windowSql}) * 1.5
                      + (SELECT COUNT(*) FROM post_reposts  pr WHERE pr.post_id = cp.id AND pr.created_at >= ${windowSql}) * 2.0
                      - (SELECT COUNT(*) FROM post_flags    pf WHERE pf.post_id = cp.id AND pf.created_at >= ${windowSql}) * 2.0
                      ) * POW(0.5, GREATEST(TIMESTAMPDIFF(HOUR, ${dateExprSql}, NOW()), 0) / ?)
                    ) AS score`,
                    [hoursWindow, hoursWindow, hoursWindow, hoursWindow, halfLife]
                )
            );
        }

        q.groupBy('cp.id');

        if (sortMode === 'popular') {
            q.orderBy('likesCount', 'desc').orderByRaw(`${dateExprSql} DESC`);
        } else if (sortMode === 'trending') {
            q.orderBy('score', 'desc').orderByRaw(`${dateExprSql} DESC`);
        } else if (sortMode === 'random') {
            // Stable pseudo-random ordering for paging
            q.orderByRaw('MD5(CONCAT(cp.id, ?))', [randomSeed]).orderBy('cp.id', 'asc');
        } else {
            q.orderByRaw(`${dateExprSql} DESC`);
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
            .leftJoin('volunteer_help_requests as vh',   'cp.id', 'vh.id')
            .where('cp.id', postId);

        // Detect optional Lost & Found resolve columns (for persistent "Marked as Found")
        const lfCols = await detectLostAndFoundResolveCols();

        // Detect optional edited_at column on community_posts
        const hasEditedAtCol = await hasCommunityPostsEditedAt();

        const dateExprSql = await getCommunityPostsDateExprSql('cp');

        const hasPos = await hasCommunityPhotoPosition();

        const select = [
            'cp.id',
            db.raw('ANY_VALUE(cp.user_id) AS user_id'),
            db.raw(`ANY_VALUE(${dateExprSql}) AS posted_at`),
            db.raw(`ANY_VALUE(${dateExprSql}) AS date_created`),
            ...(hasEditedAtCol ? [db.raw('ANY_VALUE(cp.edited_at) AS edited_at')] : [db.raw('NULL AS edited_at')]),
            'cp.category',
            'cp.latitude',
            'cp.longitude',
            db.raw('COALESCE(ANY_VALUE(cp.title), "")        AS title'),
            db.raw('COALESCE(ANY_VALUE(cp.description), "")  AS description'),
            db.raw('COALESCE(ANY_VALUE(cp.city), "")         AS city'),
            db.raw('COALESCE(ANY_VALUE(cp.county), "")       AS county'),
            db.raw('COALESCE(ANY_VALUE(cp.street_address), "") AS street_address'),

            db.raw('ANY_VALUE(u.first_name) AS first_name'),
            db.raw('ANY_VALUE(u.last_name) AS last_name'),
            db.raw('COALESCE(ANY_VALUE(u.handle), "") AS handle'),
            db.raw('COALESCE(ANY_VALUE(u.public_id), NULL) AS public_id'),
            db.raw('COALESCE(ANY_VALUE(u.avatar_url), "") AS avatar_url'),
            db.raw('COALESCE(ANY_VALUE(u.profile_picture), "") AS profile_picture'),

            db.raw('ANY_VALUE(cc.label) AS categoryLabel'),

            db.raw('ANY_VALUE(lf.lost_or_found) AS lost_or_found'),
            db.raw('ANY_VALUE(lf.reward) AS reward'),
            ...(lfCols.resolved_at ? [db.raw('ANY_VALUE(lf.resolved_at) AS resolved_at')] : [db.raw('NULL AS resolved_at')]),
            ...(lfCols.resolved_message ? [db.raw('COALESCE(ANY_VALUE(lf.resolved_message), "") AS resolved_message')] : [db.raw('"" AS resolved_message')]),
            ...(lfCols.resolved_by_user_id ? [db.raw('ANY_VALUE(lf.resolved_by_user_id) AS resolved_by_user_id')] : [db.raw('NULL AS resolved_by_user_id')]),

            db.raw('ANY_VALUE(vh.help_type) AS help_type'),
            db.raw('ANY_VALUE(vh.help_type_other) AS help_type_other'),
            db.raw('ANY_VALUE(vh.request_kind) AS request_kind'),
            db.raw('COALESCE(ANY_VALUE(vh.is_urgent), 0) AS is_urgent'),
            db.raw('COALESCE(ANY_VALUE(vh.is_urgent), 0) AS urgent'),
            db.raw(photosArrayAggSql(hasPos)),

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

/* DELETE /api/community/comments/:commentId --------------------------------- */
router.delete('/comments/:commentId', authenticateToken, async (req, res, next) => {
    try {
        const cid = Number(req.params.commentId);
        if (!Number.isFinite(cid) || cid <= 0) return res.status(400).json({ message: 'Invalid comment id' });

        await db.transaction(async (trx) => {
            const row = await trx('post_comments')
                .select('id', 'post_id', 'user_id', 'root_id', 'parent_id')
                .where({ id: cid })
                .first();

            if (!row) {
                const e = new Error('Comment not found');
                e.status = 404;
                throw e;
            }

            const post = await trx('community_posts').select('user_id').where({ id: row.post_id }).first();
            const postOwnerId = post?.user_id ?? null;

            const me = req.user?.id;
            const isAuthor = Number(row.user_id) === Number(me);
            const isPostOwner = postOwnerId != null && Number(postOwnerId) === Number(me);
            if (!isAuthor && !isPostOwner) {
                const e = new Error('Not allowed');
                e.status = 403;
                throw e;
            }

            const rootId = Number(row.root_id || row.id);

            // Build descendant set (handles nested replies safely)
            const all = await trx('post_comments')
                .select('id', 'parent_id')
                .where({ root_id: rootId });

            const children = new Map();
            for (const r of all) {
                const pid = r.parent_id == null ? null : Number(r.parent_id);
                const arr = children.get(pid) || [];
                arr.push(Number(r.id));
                children.set(pid, arr);
            }

            const toDelete = [];
            const stack = [Number(row.id)];
            const seen = new Set();

            while (stack.length) {
                const cur = stack.pop();
                if (!cur || seen.has(cur)) continue;
                seen.add(cur);
                toDelete.push(cur);
                const kids = children.get(cur) || [];
                for (const k of kids) stack.push(k);
            }

            if (!toDelete.length) return;

            // Delete likes/flags for these comments
            await trx('comment_likes').whereIn('comment_id', toDelete).del();

            const flagsEnabled = await hasCommentFlagsTable();
            if (flagsEnabled) {
                await trx('comment_flags').whereIn('comment_id', toDelete).del();
            }

            // Update root reply_count if deleting replies (not deleting the root comment itself)
            if (Number(row.parent_id) && Number.isFinite(rootId) && rootId > 0) {
                await trx('post_comments')
                    .where({ id: rootId })
                    .update({ reply_count: trx.raw('GREATEST(reply_count - ?, 0)', [toDelete.length]) });
            }

            await trx('post_comments').whereIn('id', toDelete).del();

            res.locals.deletedIds = toDelete;
        });

        return res.json({ deleted: true, ids: res.locals.deletedIds || [Number(req.params.commentId)] });
    } catch (err) {
        return next(err);
    }
});

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