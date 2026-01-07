// backend/src/routes/community/announcements.js
import express from 'express';
import multer  from 'multer';
import { Storage } from '@google-cloud/storage';
import { body, validationResult } from 'express-validator';

import knex from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router  = express.Router();

/* ────── Google Cloud Storage setup (same pattern as Lost & Found) ────── */
const storage       = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket        = storage.bucket(process.env.GCS_BUCKET);
const FOLDER_PREFIX = 'community/announcements';              // ★ folder name
const upload        = multer({ storage: multer.memoryStorage() });

/* ────── validation (location fields now optional) ────── */
const validate = [
    body('title').trim().notEmpty().isLength({ max: 50 }),
    body('description').trim().isLength({ max: 1000 }).optional({ nullable: true }),
    body('city').trim().optional({ nullable: true }),
    body('county').trim().optional({ nullable: true }),
    body('visibility').isIn(['public', 'followers']).optional({ nullable: true })
];

/* ────── POST /api/announcements ────── */
router.post(
    '/',
    authenticateToken,
    upload.array('photos', 8),
    validate,
    async (req, res, next) => {
        /* 1. validate */
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        /* 2. upload photos to GCS ------------------------------------------------ */
        let photoUrls = [];
        try {
            photoUrls = await Promise.all(
                (req.files || []).map(file => {
                    const gcsName = `${FOLDER_PREFIX}/${Date.now()}_${file.originalname}`;
                    const blob    = bucket.file(gcsName);
                    const stream  = blob.createWriteStream({
                        metadata: { contentType: file.mimetype }
                    });
                    return new Promise((resolve, reject) => {
                        stream
                            .on('error', reject)
                            .on('finish', () =>
                                resolve(
                                    `https://storage.googleapis.com/${bucket.name}/${gcsName}`
                                )
                            );
                        stream.end(file.buffer);
                    });
                })
            );
        } catch (err) {
            return next(err);
        }

        const {
            title,
            description = '',
            visibility = 'public',
            city = null,
            county = null,
            latitude,
            longitude
        } = req.body;

        /* 3. single transaction ------------------------------------------------- */
        const trx = await knex.transaction();
        try {
            /* a) community_posts */
            const [postId] = await trx('community_posts').insert({
                user_id:    req.user.id,
                category:   'announcement',
                title,
                description,
                visibility,
                city,
                county,
                latitude : latitude  ? parseFloat(latitude)  : null,
                longitude: longitude ? parseFloat(longitude) : null,
                posted_at: trx.fn.now()
            });

            /* b) community_announcements (thin FK) */
            await trx('community_announcements').insert({ post_id: postId });

            /* c) legacy announcements table (still needed) */
            await trx('announcements').insert({
                id          : postId,
                date_created: trx.fn.now(),
                user_id     : req.user.id,
                title,
                body        : description,
                city,
                county,
                latitude : latitude  ? parseFloat(latitude)  : null,
                longitude: longitude ? parseFloat(longitude) : null
            });

            /* d) photos */
            if (photoUrls.length) {
                await trx('community_photos').insert(
                    photoUrls.map((url, idx) => ({
                        post_id : postId,
                        url,
                        position: idx
                    }))
                );
            }

            await trx.commit();
            res.status(201).json({ id: postId, photos: photoUrls });
        } catch (err) {
            await trx.rollback();
            next(err);
        }
    }
);

export default router;
