// backend/src/routes/community/volunteerHelp.js
// -----------------------------------------------------------------------------
// Volunteer-Help Requests API
// -----------------------------------------------------------------------------
//
//  * Validates fields + ≤4 photos
//  * Uploads photos to GCS
//  * Inserts 1 row in community_posts         (aggregator)
//  * Inserts 1 row in volunteer_help_requests (detail; shares id)
//  * Optionally inserts rows in community_photos
//
// -----------------------------------------------------------------------------
// NOTE: Column names match the migration:
//   • help_type       : ENUM('labor','staffing','skills','other')
//   • needed_date     : DATE
//   • extra_notes     : TEXT
// -----------------------------------------------------------------------------

import express                       from 'express';
import multer                        from 'multer';
import { Storage }                   from '@google-cloud/storage';
import { body, validationResult }    from 'express-validator';

import knex              from '../../config/db.js';
import authenticateToken from '../../middleware/auth.js';

const router = express.Router();

/* ── Google Cloud Storage ─────────────────────────────────────────────────── */
const storage       = new Storage({ projectId: process.env.GCP_PROJECT_ID });
const bucket        = storage.bucket(process.env.GCS_BUCKET);
const FOLDER_PREFIX = 'community/volunteer-and-help-requests'
const upload        = multer({ storage: multer.memoryStorage() });

/* ── Validation ───────────────────────────────────────────────────────────── */
const validate = [
    body('title').trim().notEmpty().isLength({ max: 80 }),

    // must match ENUM in DB
    body('help_type').isIn(['labor', 'staffing', 'skills', 'other']),

    body('extra_notes')
        .trim()
        .isLength({ max: 2000 })
        .optional({ nullable: true }),

    body('needed_date')
        .isISO8601()
        .toDate()
        .optional({ nullable: true }),

    body('city').trim().optional({ nullable: true }),
    body('county').trim().notEmpty(),

    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
];

/* ── POST /api/volunteer-help ─────────────────────────────────────────────── */
router.post(
    '/',
    authenticateToken,
    upload.array('photos', 4),
    validate,
    async (req, res, next) => {
        /* 1️⃣ Field errors → 422 */
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(422).json({ errors: errors.array() });
        }

        /* 2️⃣ Upload photos to GCS */
        let photoUrls = [];
        try {
            photoUrls = await Promise.all(
                (req.files || []).map((file) => {
                    const gcsName = `${FOLDER_PREFIX}/${Date.now()}_${file.originalname}`;
                    const blob    = bucket.file(gcsName);
                    const stream  = blob.createWriteStream({
                        metadata: { contentType: file.mimetype },
                    });
                    return new Promise((resolve, reject) => {
                        stream
                            .on('error', reject)
                            .on('finish', () =>
                                resolve(
                                    `https://storage.googleapis.com/${bucket.name}/${gcsName}`,
                                ),
                            );
                        stream.end(file.buffer);
                    });
                }),
            );
        } catch (err) {
            return next(err);
        }

        /* 3️⃣ Transaction */
        const {
            title,
            help_type,
            extra_notes = '',
            needed_date = null,
            city        = null,
            county,
            latitude,
            longitude,
        } = req.body;

        const trx = await knex.transaction();
        try {
            /* a) aggregator row */
            const [postId] = await trx('community_posts').insert({
                user_id  : req.user.id,
                category : 'volunteer-requests', // feeds filter panel
                title,
                description: extra_notes,        // short preview
                city,
                county,
                latitude : latitude  ? parseFloat(latitude)  : null,
                longitude: longitude ? parseFloat(longitude) : null,
                posted_at: trx.fn.now(),
            });

            /* b) detail row */
            await trx('volunteer_help_requests').insert({
                id          : postId,
                help_type,
                needed_date,
                extra_notes,
                created_at  : trx.fn.now(),
            });

            /* c) photo table (optional, keeps UI uniform) */
            if (photoUrls.length) {
                await trx('community_photos').insert(
                    photoUrls.map((url, idx) => ({
                        post_id: postId,
                        url,
                        position: idx,
                    })),
                );
            }

            /* commit */
            await trx.commit();
            res.status(201).json({ id: postId, photos: photoUrls });
        } catch (err) {
            await trx.rollback();
            next(err);
        }
    },
);

export default router;
