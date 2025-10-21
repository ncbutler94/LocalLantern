// backend/src/routes/user.js
import 'dotenv/config';
import express from 'express';
import path from 'path';
import multer from 'multer';
import { Storage } from '@google-cloud/storage';
import { body, validationResult } from 'express-validator';
import authenticateToken from '../middleware/auth.js';
import db from '../config/db.js';

const router = express.Router();

/* --- ONE-TIME MIGRATIONS (run once) -----------------------------------------
-- Followers column (if not present)
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS social_json JSON NULL;
--
-- User profile photos (max 20)
CREATE TABLE IF NOT EXISTS user_profile_photos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  url VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
);
-- Likes on profile photos
CREATE TABLE IF NOT EXISTS user_photo_likes (
  photo_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (photo_id, user_id),
  INDEX idx_photo (photo_id)
);
-- Comments on profile photos
CREATE TABLE IF NOT EXISTS user_photo_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  photo_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_photo (photo_id)
);
----------------------------------------------------------------------------- */

/* --------------------------- Google Cloud Storage -------------------------- */
const gcs = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});
const bucket = gcs.bucket(process.env.GCS_BUCKET);

const deleteFromGCSByUrl = async (url) => {
  if (!url) return;
  try {
    const u = new URL(url);
    const objectPath = decodeURIComponent(u.pathname.replace(/^\/+/, ''))
        .split('/').slice(1).join('/');
    if (!objectPath) return;
    await bucket.file(objectPath).delete({ ignoreNotFound: true });
  } catch { /* ignore */ }
};

/* --------------------------------- Uploads -------------------------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith('image/')) cb(new Error('Images only'));
    else cb(null, true);
  },
});

/* ------------------------------- Helpers ---------------------------------- */
const handleRegex = /^[a-zA-Z0-9_.-]{3,30}$/;

const existsCache = { table: {}, column: {} };
const hasTable = async (table) => {
  if (existsCache.table[table] != null) return existsCache.table[table];
  const ok = await db.schema.hasTable(table);
  existsCache.table[table] = ok; return ok;
};
const hasColumn = async (table, column) => {
  const k = `${table}.${column}`;
  if (existsCache.column[k] != null) return existsCache.column[k];
  const ok = await db.schema.hasColumn(table, column);
  existsCache.column[k] = ok; return ok;
};

const isoDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.valueOf()) ? null : d.toISOString().slice(0, 10);
};

const parseMaybeJSON = (val, fallback = {}) => {
  try {
    if (val == null || val === '') return fallback;
    if (typeof val === 'object') return val;
    if (typeof val === 'string') {
      if (val === '[object Object]') return fallback;
      return JSON.parse(val);
    }
    return fallback;
  } catch {
    return fallback;
  }
};

const toPublicUser = (u, extra = {}) => ({
  id: u.id,
  public_id: u.public_id,
  handle: u.handle,
  first_name: u.first_name,
  last_name: u.last_name,
  bio: u.bio || '',
  avatar_url: u.avatar_url || u.profile_picture || null,
  profile_picture: u.profile_picture || null,
  cover_url: u.cover_url || null,
  relationship: u.relationship ?? null,
  birthday: u.birthday || null,
  job_title: u.job_title || null,
  employer: u.employer || null,
  high_school: u.high_school || null,
  college: u.college || null,
  degree: u.degree || null,
  home_city: u.home_city || null,
  home_county: u.home_county || null,
  work_history_json: u.work_history_json || null,
  education_history_json: u.education_history_json || null,
  created_at: u.created_at,
  privacy_json: u.privacy_json || null,
  social_json: u.social_json || null,
  ...extra,
});

/* relationship helpers (unchanged) */
async function showColumn(table, column) {
  try {
    const result = await db.raw('SHOW COLUMNS FROM ?? LIKE ?', [table, column]);
    return (Array.isArray(result[0]) ? result[0] : result)?.[0] || null;
  } catch { return null; }
}
async function isNumericColumn(table, column) {
  try {
    const row = await showColumn(table, column);
    const type = row?.Type || '';
    return /\b(int|decimal|float|double|tinyint|smallint|bigint)\b/i.test(type);
  } catch { return false; }
}
async function getEnumValues(table, column) {
  const row = await showColumn(table, column);
  const type = row?.Type || '';
  const m = type.match(/^enum\((.*)\)$/i);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'"));
}
const relToCode = (txt) => {
  const t = String(txt || '').toLowerCase().replace(/[’]/g, "'");
  if (t === 'single') return 1;
  if (t.includes('in a relationship') || t === 'in-relationship' || t === 'in relationship') return 2;
  if (t.includes('married')) return 3;
  if (t.includes('complicated') || t === "it's complicated" || t === 'its complicated' || t === 'its-complicated') return 4;
  return 0;
};
const relToEnum = (txt) => {
  const t = String(txt || '').trim().toLowerCase().replace(/[’]/g, "'");
  if (!t) return null;
  if (t === 'single') return 'single';
  if (t === 'in-relationship' || t === 'in relationship' || t === 'in a relationship') return 'in-relationship';
  if (t === 'married') return 'married';
  if (t === "it's complicated" || t === 'its complicated' || t === 'its-complicated') return 'its-complicated';
  if (t === 'prefer-not' || t === 'prefer not' || t === 'prefer not to say') return 'prefer-not';
  return null;
}
async function normalizeRelationship(input) {
  const numeric = await isNumericColumn('users', 'relationship');
  if (numeric) return relToCode(input);
  const enumVals = await getEnumValues('users', 'relationship');
  if (enumVals && enumVals.length) {
    const candidate = relToEnum(input);
    if (candidate && enumVals.includes(candidate)) return candidate;
    if (enumVals.includes('prefer-not')) return 'prefer-not';
    return null;
  }
  return relToEnum(input);
}
const toBool = (v) => ['1', 'true', 'on', 'yes'].includes(String(v || '').toLowerCase());

/* ------------------- Ensure extra tables / columns exist ------------------- */
async function ensureMessagesTable() {
  if (await hasTable('user_messages')) return;
  await db.schema.createTable('user_messages', (t) => {
    t.increments('id').primary();
    t.integer('from_user_id').notNullable().index();
    t.integer('to_user_id').notNullable().index();
    t.string('subject', 200).notNullable().defaultTo('');
    t.text('body').notNullable();
    t.timestamp('created_at').defaultTo(db.fn.now());
  });
}
async function ensureHandleLogTable() {
  if (await hasTable('user_handle_changes')) return;
  await db.schema.createTable('user_handle_changes', (t) => {
    t.increments('id').primary();
    t.integer('user_id').notNullable().index();
    t.string('old_handle', 64).nullable();
    t.string('new_handle', 64).notNullable();
    t.timestamp('created_at').defaultTo(db.fn.now());
  });
}
async function ensureSocialColumn() {
  if (await hasColumn('users', 'social_json')) return;
  await db.schema.table('users', (t) => t.json('social_json').nullable());
}
async function ensurePhotoTables() {
  if (!(await hasTable('user_profile_photos'))) {
    await db.schema.createTable('user_profile_photos', (t) => {
      t.increments('id').primary();
      t.integer('user_id').notNullable().index();
      t.string('url', 500).notNullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }
  if (!(await hasTable('user_photo_likes'))) {
    await db.schema.createTable('user_photo_likes', (t) => {
      t.integer('photo_id').notNullable().index();
      t.integer('user_id').notNullable().index();
      t.timestamp('created_at').defaultTo(db.fn.now());
      t.primary(['photo_id', 'user_id']);
    });
  }
  if (!(await hasTable('user_photo_comments'))) {
    await db.schema.createTable('user_photo_comments', (t) => {
      t.increments('id').primary();
      t.integer('photo_id').notNullable().index();
      t.integer('user_id').notNullable().index();
      t.text('content').notNullable();
      t.timestamp('created_at').defaultTo(db.fn.now());
    });
  }
}

/* ------------------- Handle change policy: 2 per 15 days ------------------- */
const WINDOW_MS = 15 * 24 * 60 * 60 * 1000;
async function handleChangeStats(userId) {
  await ensureHandleLogTable();
  const since = new Date(Date.now() - WINDOW_MS);
  const rows = await db('user_handle_changes')
      .where({ user_id: userId })
      .andWhere('created_at', '>=', since)
      .orderBy('created_at', 'asc');
  const count = rows.length;
  if (count >= 2) {
    const nextAllowed = new Date(new Date(rows[0].created_at).getTime() + WINDOW_MS);
    return { remaining: 0, nextAllowed };
  }
  return { remaining: 2 - count, nextAllowed: null };
}

/* --------------------------- GET /users/profile (me) ----------------------- */
router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    await ensureSocialColumn();
    const u = await db('users')
        .select(
            'id','public_id','handle','first_name','last_name','bio','avatar_url','profile_picture','cover_url',
            'relationship','birthday','job_title','employer','high_school','college','degree',
            'home_city','home_county','work_history_json','education_history_json','created_at','updated_at','privacy_json','social_json'
        )
        .where({ id: req.user.id }).first();

    const stats = await handleChangeStats(req.user.id);
    res.json({
      user: toPublicUser(u, { handle_change_stats: { remaining: stats.remaining, nextAllowed: stats.nextAllowed?.toISOString() || null } })
    });
  } catch (err) { next(err); }
});

/* --------------- PUT /users/profile (fields + images + handle) ------------- */
router.put(
    '/profile',
    authenticateToken,
    upload.fields([{ name: 'profile_picture' }, { name: 'cover_photo' }]),
    [
      body('first_name').optional().isLength({ min: 1, max: 50 }).trim(),
      body('last_name').optional().isLength({ min: 1, max: 50 }).trim(),
      body('bio').optional().isLength({ max: 500 }).trim(),
      body('relationship').optional().isLength({ max: 40 }).trim(),
      body('birthday').optional().isISO8601(),
      body('job_title').optional().isLength({ max: 120 }).trim(),
      body('employer').optional().isLength({ max: 160 }).trim(),
      body('high_school').optional().isLength({ max: 160 }).trim(),
      body('college').optional().isLength({ max: 160 }).trim(),
      body('degree').optional().isLength({ max: 160 }).trim(),
      body('home_city').optional().isLength({ max: 120 }).trim(),
      body('home_county').optional().isLength({ max: 120 }).trim(),
      body('work_history_json').optional().isString(),
      body('education_history_json').optional().isString(),
      body('cover_url').optional().isURL().trim(),
      body('handle').optional().custom((h) => !h || handleRegex.test(h)).withMessage('Handle may contain letters, numbers, dot, dash, underscore (3-30 chars).'),
      body('privacy_json').optional().custom((v) => {
        if (v == null) return true;
        if (typeof v === 'object') return true;
        if (typeof v === 'string') { if (v === '[object Object]') return true; try { JSON.parse(v); return true; } catch { return false; } }
        return false;
      }),
    ],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      await ensureSocialColumn();

      const updates = {};
      const textFields = [
        'first_name','last_name','bio','cover_url','job_title','employer','high_school','college','degree',
        'home_city','home_county','work_history_json','education_history_json',
      ];
      textFields.forEach((f) => { if (req.body[f] != null) updates[f] = req.body[f]; });
      if (req.body.birthday != null) updates.birthday = isoDate(req.body.birthday);

      const selectCols = ['id','handle','avatar_url','profile_picture','cover_url','privacy_json','relationship','social_json'];
      if (await hasColumn('users','handle_changed_at')) selectCols.push('handle_changed_at');
      else if (await hasColumn('users','handle_last_changed_at')) selectCols.push('handle_last_changed_at');
      const current = await db('users').select(selectCols).where({ id: req.user.id }).first();

      // handle change policy
      if (req.body.handle != null && req.body.handle !== current.handle) {
        if (req.body.handle === '') return res.status(400).json({ message: 'Handle cannot be empty' });
        if (!handleRegex.test(req.body.handle))
          return res.status(400).json({ message: 'Handle may contain letters, numbers, dot, dash, underscore (3-30 chars).' });
        const clashUser = await db('users').whereRaw('LOWER(handle)=LOWER(?)', [req.body.handle]).andWhereNot({ id: req.user.id }).first();
        if (clashUser) return res.status(409).json({ message: 'That profile URL is already taken' });

        const stats = await handleChangeStats(req.user.id);
        if (stats.remaining <= 0) {
          return res.status(429).json({ message: `You can change your profile URL again on ${new Date(stats.nextAllowed).toLocaleDateString()}.` });
        }
        updates.handle = req.body.handle;
        if (await hasColumn('users','handle_changed_at')) updates.handle_changed_at = db.fn.now();
        else if (await hasColumn('users','handle_last_changed_at')) updates.handle_last_changed_at = db.fn.now();
      }

      // relationship normalize
      if (req.body.relationship !== undefined) {
        const normalized = await normalizeRelationship(req.body.relationship);
        updates.relationship = normalized;
      }

      // privacy_json
      if (req.body.privacy_json != null) {
        const pj = parseMaybeJSON(req.body.privacy_json, undefined);
        if (pj !== undefined) updates.privacy_json = JSON.stringify(pj);
      }

      // deletion flags
      const deleteAvatar = toBool(req.body.delete_avatar);
      const deleteCover  = toBool(req.body.delete_cover);

      // upload helpers
      const uploadTo = async (buf, contentType, destPath) =>
          new Promise((resolve, reject) => {
            const file = bucket.file(destPath);
            const stream = file.createWriteStream({ metadata: { contentType }, resumable: false });
            stream.on('error', reject);
            stream.on('finish', () => resolve(`https://storage.googleapis.com/${bucket.name}/${destPath}`));
            stream.end(buf);
          });

      const profileFile = req.files?.profile_picture?.[0];
      const coverFile   = req.files?.cover_photo?.[0];

      try {
        if (profileFile) {
          const ext = path.extname(profileFile.originalname) || '.jpg';
          const dest = `users/profile-pictures/user_${req.user.id}_${Date.now()}${ext}`;
          const url = await uploadTo(profileFile.buffer, profileFile.mimetype, dest);
          updates.avatar_url = url; updates.profile_picture = url;
          await deleteFromGCSByUrl(current?.avatar_url || current?.profile_picture);
        } else if (deleteAvatar) {
          await deleteFromGCSByUrl(current?.avatar_url || current?.profile_picture);
          updates.avatar_url = null; updates.profile_picture = null;
        }

        if (coverFile) {
          const ext = path.extname(coverFile.originalname) || '.jpg';
          const dest = `users/cover-photos/user_${req.user.id}_${Date.now()}${ext}`;
          const url = await uploadTo(coverFile.buffer, coverFile.mimetype, dest);
          updates.cover_url = url;
          await deleteFromGCSByUrl(current?.cover_url);
        } else if (deleteCover) {
          await deleteFromGCSByUrl(current?.cover_url);
          updates.cover_url = null;
        }

        await db('users').where({ id: req.user.id }).update({ ...updates, updated_at: db.fn.now() });

        // if handle changed, log it
        if (updates.handle && updates.handle !== current.handle) {
          await ensureHandleLogTable();
          await db('user_handle_changes').insert({
            user_id: req.user.id,
            old_handle: current.handle || null,
            new_handle: updates.handle,
            created_at: db.fn.now(),
          });
        }

        const updated = await db('users')
            .select(
                'id','public_id','handle','first_name','last_name','bio','avatar_url','profile_picture','cover_url','relationship','birthday',
                'job_title','employer','high_school','college','degree','home_city','home_county','work_history_json','education_history_json',
                'created_at','privacy_json','social_json'
            )
            .where({ id: req.user.id }).first();

        const stats = await handleChangeStats(req.user.id);
        res.json({ user: toPublicUser(updated, { handle_change_stats: { remaining: stats.remaining, nextAllowed: stats.nextAllowed?.toISOString() || null } }) });
      } catch (err) { next(err); }
    }
);

/* ---------------- PUT /users/privacy — atomic privacy save ----------------- */
router.put(
    '/privacy',
    authenticateToken,
    [body('section').isString().isLength({ min: 1 }), body('level').isIn(['public', 'friends', 'private'])],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      try {
        const u = await db('users').select('privacy_json').where({ id: req.user.id }).first();
        const current = parseMaybeJSON(u?.privacy_json, {});
        const nextJson = { ...current, [req.body.section]: req.body.level };
        await db('users').where({ id: req.user.id }).update({ privacy_json: JSON.stringify(nextJson), updated_at: db.fn.now() });
        res.json({ privacy_json: nextJson });
      } catch (err) { next(err); }
    }
);

/* ---------------------- GET /users/public/:handleOrId ---------------------- */
router.get('/public/:handleOrId', async (req, res, next) => {
  try {
    await ensureSocialColumn();
    const { handleOrId } = req.params;
    let u = await db('users').whereRaw('LOWER(handle)=LOWER(?)', [handleOrId]).first();
    if (!u && /^\d+$/.test(handleOrId)) {
      u = (await db('users').where({ public_id: Number(handleOrId) }).first())
          || (await db('users').where({ id: Number(handleOrId) }).first());
    }
    if (!u) return res.status(404).json({ message: 'User not found' });

    const userId = u.id;
    const [posts, photos, lostFound, alerts, recsTips, volunteer, likes, comments] = await Promise.all([
      db('community_posts')
          .select('id','category','title','description','posted_at as date_created','city','county')
          .where({ user_id: userId }).orderBy('posted_at','desc').limit(200),
      db('community_photos as cp')
          .join('community_posts as p','cp.post_id','p.id')
          .where('p.user_id', userId).select('cp.id','cp.post_id','cp.url').orderBy('cp.post_id','desc'),
      db('lost_and_found').where({ user_id: userId }).orderBy('date_created','desc').limit(200),
      db('public_safety_alerts').where({ user_id: userId }).orderBy('date_created','desc').limit(200),
      db('recommendations_and_tips').where({ user_id: userId }).orderBy('date_created','desc').limit(200),
      db('volunteer_help_requests as v').join('community_posts as p','v.id','p.id')
          .where('p.user_id', userId).select('v.*','p.city','p.county','p.posted_at as date_created'),
      db('post_likes').where({ user_id: userId }).orderBy('created_at','desc').limit(200),
      db('post_comments').where({ user_id: userId }).orderBy('created_at','desc').limit(200),
    ]);

    res.json({ profile: toPublicUser(u), activity: { posts, photos, lostFound, alerts, recsTips, volunteer, likes, comments } });
  } catch (err) { next(err); }
});

/* ------------------------- GET /users/social/:who -------------------------- */
router.get('/social/:handleOrId', async (req, res, next) => {
  try {
    await ensureSocialColumn();
    const { handleOrId } = req.params;
    let u = await db('users').select('id','social_json').whereRaw('LOWER(handle)=LOWER(?)', [handleOrId]).first();
    if (!u && /^\d+$/.test(handleOrId)) {
      u = await db('users').select('id','social_json').where({ public_id: Number(handleOrId) }).first()
          || await db('users').select('id','social_json').where({ id: Number(handleOrId) }).first();
    }
    if (!u) return res.status(404).json({ message: 'User not found' });

    const sj = parseMaybeJSON(u.social_json, { followers: [], following: [] });
    const followersIds = Array.isArray(sj.followers) ? sj.followers.slice(0, 300) : [];
    const followingIds = Array.isArray(sj.following) ? sj.following.slice(0, 300) : [];

    const pick = ['id','public_id','handle','first_name','last_name','avatar_url','profile_picture','home_city','home_county'];
    const followers = followersIds.length ? await db('users').select(pick).whereIn('id', followersIds) : [];
    const following = followingIds.length ? await db('users').select(pick).whereIn('id', followingIds) : [];

    res.json({
      followers: followers.map(v => toPublicUser(v)),
      following: following.map(v => toPublicUser(v)),
      counts: { followers: followersIds.length, following: followingIds.length }
    });
  } catch (err) { next(err); }
});

/* ----------------------------- POST /users/follow -------------------------- */
router.post(
    '/follow',
    authenticateToken,
    [body('target_id').isInt(), body('action').isIn(['follow','unfollow'])],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      await ensureSocialColumn();

      const me = req.user.id;
      const targetId = Number(req.body.target_id);
      if (targetId === me) return res.status(400).json({ message: 'Cannot follow yourself' });

      const [meRow, tgRow] = await Promise.all([
        db('users').select('id','social_json').where({ id: me }).first(),
        db('users').select('id','social_json').where({ id: targetId }).first(),
      ]);
      if (!tgRow) return res.status(404).json({ message: 'Target not found' });

      const meSJ = parseMaybeJSON(meRow.social_json, { followers: [], following: [] });
      const tgSJ = parseMaybeJSON(tgRow.social_json, { followers: [], following: [] });

      const already = Array.isArray(meSJ.following) && meSJ.following.includes(targetId);

      if (req.body.action === 'follow') {
        if (!already) {
          meSJ.following = Array.from(new Set([...(meSJ.following || []), targetId]));
          tgSJ.followers = Array.from(new Set([...(tgSJ.followers || []), me]));
        }
      } else {
        if (already) {
          meSJ.following = (meSJ.following || []).filter((id) => id !== targetId);
          tgSJ.followers = (tgSJ.followers || []).filter((id) => id !== me);
        }
      }

      await Promise.all([
        db('users').where({ id: me }).update({ social_json: JSON.stringify(meSJ) }),
        db('users').where({ id: targetId }).update({ social_json: JSON.stringify(tgSJ) }),
      ]);

      res.json({
        ok: true,
        isFollowing: req.body.action === 'follow',
        counts: {
          me_following: meSJ.following?.length || 0,
          target_followers: tgSJ.followers?.length || 0
        }
      });
    }
);

/* ----------------------------- POST /users/message ------------------------- */
router.post(
    '/message',
    authenticateToken,
    [body('to_user_id').isInt(), body('subject').isLength({ min: 1, max: 200 }).trim(), body('body').isLength({ min: 1, max: 5000 })],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
      await ensureMessagesTable();

      const toUser = await db('users').select('id').where({ id: req.body.to_user_id }).first();
      if (!toUser) return res.status(404).json({ message: 'Recipient not found' });

      await db('user_messages').insert({
        from_user_id: req.user.id,
        to_user_id: toUser.id,
        subject: req.body.subject.slice(0, 200),
        body: req.body.body.slice(0, 5000),
      });

      res.json({ ok: true });
    }
);

/* ===================== PROFILE PHOTOS (NEW) ================================ */

// list photos for a user
router.get('/photos/:handleOrId', async (req, res, next) => {
  try {
    await ensurePhotoTables();
    const { handleOrId } = req.params;
    let u = await db('users').select('id').whereRaw('LOWER(handle)=LOWER(?)', [handleOrId]).first();
    if (!u && /^\d+$/.test(handleOrId)) {
      u = await db('users').select('id').where({ public_id: Number(handleOrId) }).first()
          || await db('users').select('id').where({ id: Number(handleOrId) }).first();
    }
    if (!u) return res.status(404).json({ message: 'User not found' });

    const items = await db('user_profile_photos').where({ user_id: u.id })
        .orderBy('created_at', 'desc').limit(20);

    res.json({ photos: items });
  } catch (err) { next(err); }
});

// upload photos (owner only)
router.post('/photos', authenticateToken, upload.array('photos', 20), async (req, res, next) => {
  try {
    await ensurePhotoTables();
    const currentCount = await db('user_profile_photos').where({ user_id: req.user.id }).count({ c: '*' }).first();
    const remaining = 20 - Number(currentCount?.c || 0);
    if (remaining <= 0) return res.status(400).json({ message: 'You already have 20 photos.' });

    const files = (req.files || []).slice(0, remaining);
    if (files.length === 0) return res.status(400).json({ message: 'No photos to upload.' });

    const saved = [];
    // helper
    const uploadTo = async (buf, contentType, destPath) =>
        new Promise((resolve, reject) => {
          const file = bucket.file(destPath);
          const stream = file.createWriteStream({ metadata: { contentType }, resumable: false });
          stream.on('error', reject);
          stream.on('finish', () => resolve(`https://storage.googleapis.com/${bucket.name}/${destPath}`));
          stream.end(buf);
        });

    for (let i = 0; i < files.length; i += 1) {
      const f = files[i];
      const ext = path.extname(f.originalname) || '.jpg';
      const dest = `users/user_profile_photos/user_${req.user.id}_${Date.now()}_${i}${ext}`;
      const url = await uploadTo(f.buffer, f.mimetype, dest);
      const [id] = await db('user_profile_photos').insert({ user_id: req.user.id, url });
      saved.push({ id, url, user_id: req.user.id });
    }

    const all = await db('user_profile_photos').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(20);
    res.json({ photos: all });
  } catch (err) { next(err); }
});

// delete a photo (owner only)
router.delete('/photos/:photoId', authenticateToken, async (req, res, next) => {
  try {
    await ensurePhotoTables();
    const photo = await db('user_profile_photos').where({ id: Number(req.params.photoId) }).first();
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    if (photo.user_id !== req.user.id) return res.status(403).json({ message: 'Not allowed' });

    await deleteFromGCSByUrl(photo.url);
    await db('user_photo_likes').where({ photo_id: photo.id }).del();
    await db('user_photo_comments').where({ photo_id: photo.id }).del();
    await db('user_profile_photos').where({ id: photo.id }).del();

    const all = await db('user_profile_photos').where({ user_id: req.user.id }).orderBy('created_at', 'desc').limit(20);
    res.json({ photos: all });
  } catch (err) { next(err); }
});

// like toggle
router.post('/photos/:photoId/like', authenticateToken, async (req, res, next) => {
  try {
    await ensurePhotoTables();
    const pid = Number(req.params.photoId);
    const row = await db('user_photo_likes').where({ photo_id: pid, user_id: req.user.id }).first();
    if (row) {
      await db('user_photo_likes').where({ photo_id: pid, user_id: req.user.id }).del();
    } else {
      await db('user_photo_likes').insert({ photo_id: pid, user_id: req.user.id });
    }
    const c = await db('user_photo_likes').where({ photo_id: pid }).count({ c: '*' }).first();
    res.json({ liked: !row, likes: Number(c?.c || 0) });
  } catch (err) { next(err); }
});

// photo comments
router.get('/photos/:photoId/comments', async (req, res, next) => {
  try {
    await ensurePhotoTables();
    const pid = Number(req.params.photoId);
    const rows = await db('user_photo_comments as c')
        .join('users as u', 'c.user_id', 'u.id')
        .select('c.id','c.photo_id','c.user_id','c.content','c.created_at',
            'u.first_name','u.last_name','u.avatar_url','u.profile_picture')
        .where('c.photo_id', pid).orderBy('c.created_at','desc').limit(200);
    res.json(rows);
  } catch (err) { next(err); }
});
router.post('/photos/:photoId/comments', authenticateToken, [body('content').isLength({ min: 1, max: 1000 })], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    await ensurePhotoTables();
    const pid = Number(req.params.photoId);
    const [id] = await db('user_photo_comments').insert({
      photo_id: pid, user_id: req.user.id, content: String(req.body.content || '').slice(0, 1000)
    });
    const c = await db('user_photo_comments as c')
        .join('users as u', 'c.user_id', 'u.id')
        .select('c.id','c.photo_id','c.user_id','c.content','c.created_at',
            'u.first_name','u.last_name','u.avatar_url','u.profile_picture')
        .where('c.id', id).first();
    res.json(c);
  } catch (err) { next(err); }
});

/* --------------------------- USER SEARCH (share) --------------------------- */
router.get('/search', async (req, res, next) => {
  try {
    const { q = '', county = '', city = '' } = req.query;
    const qb = db('users').select('id','public_id','handle','first_name','last_name','avatar_url','profile_picture','home_city','home_county')
        .limit(60).orderBy('first_name','asc');
    if (q) qb.whereRaw("LOWER(CONCAT_WS(' ', first_name, last_name, handle)) LIKE ?", [`%${String(q).toLowerCase()}%`]);
    if (county) qb.andWhereRaw('LOWER(home_county) = LOWER(?)', [String(county)]);
    if (city) qb.andWhereRaw('LOWER(home_city) = LOWER(?)', [String(city)]);
    const rows = await qb;
    res.json(rows.map(toPublicUser));
  } catch (err) { next(err); }
});

/* --------------------------- Delete account (same) ------------------------- */
router.delete('/', authenticateToken, async (req, res, next) => {
  try {
    const u = await db('users').select('avatar_url','profile_picture','cover_url').where({ id: req.user.id }).first();
    await deleteFromGCSByUrl(u?.avatar_url || u?.profile_picture);
    await deleteFromGCSByUrl(u?.cover_url);
    await db('users').where({ id: req.user.id }).del();
    res.clearCookie('token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    res.sendStatus(204);
  } catch (err) { next(err); }
});

export default router;
