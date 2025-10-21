// ESM migration (works when your backend uses "type": "module")
/**
 * Adds:
 *  - business_locations table (supports multi-location businesses)
 *  - unique index on business_reviews (business_id, user_id) for upsert
 *
 * Notes:
 *  - JSON column uses jsonb on Postgres, json on MySQL; falls back to text otherwise.
 *  - Foreign key: business_locations.business_id → businesses.id (ON DELETE CASCADE)
 *  - Backfill: (optional, safe) copies existing precise coordinates from businesses
 */

export async function up(knex) {
    const client = (knex?.client?.config?.client || '').toLowerCase();
    const isPg = ['pg', 'postgres', 'postgresql'].includes(client);
    const isMy = ['mysql', 'mysql2'].includes(client);

    /* ----------------------- business_locations ----------------------- */
    const hasLocations = await knex.schema.hasTable('business_locations');
    if (!hasLocations) {
        await knex.schema.createTable('business_locations', (table) => {
            table.increments('id').primary();

            // FK → businesses.id
            // .unsigned() is harmless on PG and required on many MySQL setups
            table.integer('business_id').unsigned().notNullable()
                .references('id').inTable('businesses')
                .onDelete('CASCADE');

            table.string('nickname', 100);          // e.g. "Downtown", "Northside" (optional)
            table.string('street_address', 120);    // optional
            table.string('city', 100);
            table.string('county', 100);

            // Use DECIMAL for consistent precision across PG/MySQL
            table.decimal('latitude', 9, 6);
            table.decimal('longitude', 9, 6);

            table.string('phone', 25);

            if (isPg) table.jsonb('hours_json').nullable();
            else if (isMy) table.json('hours_json').nullable();
            else table.text('hours_json'); // fallback

            table.boolean('is_primary').notNullable().defaultTo(false);

            // created_at / updated_at with defaults
            table.timestamps(true, true);

            table.index(['business_id'], 'idx_business_locations_business');
            table.index(['business_id', 'is_primary'], 'idx_business_locations_business_primary');
        });
    }

    /* ---------------- unique index on business_reviews ---------------- */
    // Needed by router: .onConflict(['business_id', 'user_id']).merge(...)
    if (isPg) {
        await knex.raw(
            'CREATE UNIQUE INDEX IF NOT EXISTS uq_business_reviews_business_user ON business_reviews (business_id, user_id)'
        );
    } else if (isMy) {
        // Check if index exists; add only if missing
        const [rows] = await knex.raw(`
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'business_reviews'
        AND INDEX_NAME = 'uq_business_reviews_business_user'
      LIMIT 1
    `);
        const hasIdx = Array.isArray(rows) ? rows.length > 0 : !!rows;
        if (!hasIdx) {
            await knex.schema.alterTable('business_reviews', (t) => {
                t.unique(['business_id', 'user_id'], 'uq_business_reviews_business_user');
            });
        }
    } else {
        // Generic attempt; ignore if it already exists
        try {
            await knex.schema.alterTable('business_reviews', (t) => {
                t.unique(['business_id', 'user_id'], 'uq_business_reviews_business_user');
            });
        } catch (_) {}
    }

    /* ------------------------ optional backfill ----------------------- */
    // If you already have precise lat/lng on businesses, copy them as a primary location.
    // Safe to run: skips insert when there are no candidate rows.
    const candidates = await knex('businesses')
        .select(
            'id as business_id',
            'street_address',
            'city',
            'county',
            'latitude',
            'longitude',
            'phone',
            'hours_json'
        )
        .whereNotNull('latitude')
        .whereNotNull('longitude');

    if (candidates.length) {
        const now = knex.fn.now();
        const rows = candidates.map((r) => ({
            business_id: r.business_id,
            nickname: null,
            street_address: r.street_address || null,
            city: r.city || null,
            county: r.county || null,
            latitude: r.latitude,
            longitude: r.longitude,
            phone: r.phone || null,
            hours_json: r.hours_json ?? null,
            is_primary: true,
            created_at: now,
            updated_at: now,
        }));

        // Insert in chunks to be friendly to MySQL's packet limits
        const CHUNK = 500;
        for (let i = 0; i < rows.length; i += CHUNK) {
            // eslint-disable-next-line no-await-in-loop
            await knex('business_locations').insert(rows.slice(i, i + CHUNK));
        }
    }
}

export async function down(knex) {
    const client = (knex?.client?.config?.client || '').toLowerCase();
    const isPg = ['pg', 'postgres', 'postgresql'].includes(client);
    const isMy = ['mysql', 'mysql2'].includes(client);

    // Drop unique index from business_reviews
    if (isPg) {
        await knex.raw('DROP INDEX IF EXISTS uq_business_reviews_business_user');
    } else if (isMy) {
        // Only drop if it exists (MySQL has no IF NOT EXISTS here)
        const [rows] = await knex.raw(`
      SELECT 1
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'business_reviews'
        AND INDEX_NAME = 'uq_business_reviews_business_user'
      LIMIT 1
    `);
        const hasIdx = Array.isArray(rows) ? rows.length > 0 : !!rows;
        if (hasIdx) {
            await knex.schema.alterTable('business_reviews', (t) => {
                t.dropUnique(['business_id', 'user_id'], 'uq_business_reviews_business_user');
            });
        }
    } else {
        try {
            await knex.schema.alterTable('business_reviews', (t) => {
                t.dropUnique(['business_id', 'user_id'], 'uq_business_reviews_business_user');
            });
        } catch (_) {}
    }

    await knex.schema.dropTableIfExists('business_locations');
}
