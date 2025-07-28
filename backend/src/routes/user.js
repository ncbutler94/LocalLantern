// backend/src/routes/user.js
import 'dotenv/config';                                    // :contentReference[oaicite:2]{index=2}&#8203;:contentReference[oaicite:3]{index=3}
import express from 'express';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import multer from 'multer';
import { body, validationResult } from 'express-validator';
import authenticateToken from '../middleware/auth.js';
import db from '../config/db.js';

const router = express.Router();

// ── Configure GCS ───────────────────────────────────────────
const gcs = new Storage({
  projectId: process.env.GCP_PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});
const bucket = gcs.bucket(process.env.GCS_BUCKET);

// ── Multer in-memory setup ────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image uploads allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// ── GET phone for 2FA ────────────────────────────────────────
router.get('/basic-info', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const user = await db('users').where({ email }).first();
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({ phone_number: user.phone_number });
  } catch (err) {
    next(err);
  }
});

// ── GET /users/profile ────────────────────────────────────────
router.get(
    '/profile',
    authenticateToken,
    async (req, res, next) => {
      try {
        const user = await db('users')
            .select(
                'id',
                'first_name',
                'last_name',
                'email',
                'phone_number',
                'is_verified',
                'profile_picture'
            )
            .where({ id: req.user.id })
            .first();
        res.json({ user });
      } catch (err) {
        next(err);
      }
    }
);

// ── PUT /users/profile with optional picture upload ────────────
router.put(
    '/profile',
    authenticateToken,
    upload.single('profile_picture'),
    [
      body('first_name').optional().isLength({ min: 1, max: 50 }).trim().escape(),
      body('last_name').optional().isLength({ min: 1, max: 50 }).trim().escape(),
      body('phone_number').optional().isMobilePhone('any')
    ],
    async (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const updates = {};
      ['first_name', 'last_name', 'phone_number'].forEach(f => {
        if (req.body[f] != null) updates[f] = req.body[f];
      });

      if (req.file) {
        try {
          const ext = path.extname(req.file.originalname);
          const gcsName = `profile_pictures/user_${req.user.id}_${Date.now()}${ext}`;
          const file = bucket.file(gcsName);

          await new Promise((resolve, reject) => {
            const stream = file.createWriteStream({
              metadata: { contentType: req.file.mimetype },
              resumable: false
            });
            stream.on('error', reject);
            stream.on('finish', resolve);
            stream.end(req.file.buffer);
          });

          updates.profile_picture = `https://storage.googleapis.com/${bucket.name}/${gcsName}`;
        } catch (err) {
          return next(err);
        }
      }

      try {
        await db('users')
            .where({ id: req.user.id })
            .update({ ...updates, updated_at: db.fn.now() });

        const updated = await db('users')
            .select(
                'id',
                'first_name',
                'last_name',
                'email',
                'phone_number',
                'is_verified',
                'profile_picture'
            )
            .where({ id: req.user.id })
            .first();

        res.json({ user: updated });
      } catch (err) {
        next(err);
      }
    }
);

// ── DELETE /users ──────────────────────────────────────────────
router.delete(
    '/',
    authenticateToken,
    async (req, res, next) => {
      try {
        const user = await db('users')
            .select('profile_picture')
            .where({ id: req.user.id })
            .first();

        if (user?.profile_picture) {
          const url = new URL(user.profile_picture);
          const parts = url.pathname.split('/');
          const objectName = parts.slice(2).join('/');
          await bucket.file(objectName).delete().catch(err => {
            console.warn('GCS delete failed:', err.message);
          });
        }

        await db('users').where({ id: req.user.id }).del();

        res.clearCookie('token', {
          httpOnly: true,
          secure:   process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path:     '/'
        });

        res.sendStatus(204);
      } catch (err) {
        next(err);
      }
    }
);

export default router;
