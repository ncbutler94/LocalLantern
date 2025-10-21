/**
 * Knex migration: add ratings + reviews system
 *
 * - Adds rating_half_stars + review_count to businesses
 * - Creates business_reviews table with FK to businesses + users
 * - Installs triggers/procs to refresh business summary (MySQL & Postgres)
 */

async function up(knex) {
    // 1) Add columns to businesses (only if they don't exist yet)
    const hasRating = await knex.schema.hasColumn('businesses', 'rating_half_stars');
    const hasCount = await knex.schema.hasColumn('businesses', 'review_count');

    if (!hasRating || !hasCount) {
        await knex.schema.alterTable('businesses', (table) => {
            if (!hasRating) {
                table.specificType('rating_half_stars', 'smallint').notNullable().defaultTo(0);
            }
            if (!hasCount) {
                table.integer('review_count').notNullable().defaultTo(0);
            }
        });
    }

    // 2) Create business_reviews if not exists
    const hasReviews = await knex.schema.hasTable('business_reviews');
    if (!hasReviews) {
        await knex.schema.createTable('business_reviews', (table) => {
            table.bigIncrements('id').primary();

            table.bigInteger('business_id').unsigned().notNullable()
                .references('id').inTable('businesses').onDelete('CASCADE');
            table.bigInteger('user_id').unsigned().notNullable()
                .references('id').inTable('users').onDelete('CASCADE');

            table.specificType('rating_half_stars', 'smallint').notNullable(); // 0..10
            table.text('comment');

            table.timestamps(true, true);

            table.unique(['business_id', 'user_id']);
            table.index(['business_id'], 'idx_business_reviews_business_id');
        });
    }

    const client = knex.client.config.client || '';

    if (client.includes('pg')) {
        // === PostgreSQL summary function + trigger ===
        await knex.schema.raw(`
      CREATE OR REPLACE FUNCTION refresh_business_rating(p_business_id BIGINT)
      RETURNS VOID AS $$
        UPDATE businesses b
        SET review_count = r.cnt,
            rating_half_stars = COALESCE(ROUND(r.avg_half), 0)::SMALLINT
        FROM (
          SELECT COUNT(*) AS cnt,
                 AVG(rating_half_stars) AS avg_half
          FROM business_reviews
          WHERE business_id = p_business_id
        ) r
        WHERE b.id = p_business_id;
      $$ LANGUAGE sql;
    `);

        await knex.schema.raw(`
      CREATE OR REPLACE FUNCTION trg_refresh_business_rating()
      RETURNS trigger AS $$
      BEGIN
        PERFORM refresh_business_rating(COALESCE(NEW.business_id, OLD.business_id));
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;
    `);

        await knex.schema.raw(`
      CREATE TRIGGER business_reviews_refresh
      AFTER INSERT OR UPDATE OR DELETE ON business_reviews
      FOR EACH ROW EXECUTE FUNCTION trg_refresh_business_rating();
    `);
    } else if (['mysql', 'mysql2'].includes(client)) {
        // === MySQL summary procedure + triggers ===
        await knex.schema.raw(`DROP PROCEDURE IF EXISTS refresh_business_rating;`);
        await knex.schema.raw(`
      CREATE PROCEDURE refresh_business_rating(IN p_business_id BIGINT)
      BEGIN
        UPDATE businesses b
        JOIN (
          SELECT COUNT(*) AS cnt, ROUND(AVG(rating_half_stars)) AS avg_half
          FROM business_reviews
          WHERE business_id = p_business_id
        ) r ON b.id = p_business_id
        SET b.review_count = r.cnt,
            b.rating_half_stars = IFNULL(r.avg_half, 0);
      END;
    `);

        await knex.schema.raw(`DROP TRIGGER IF EXISTS business_reviews_ai;`);
        await knex.schema.raw(`DROP TRIGGER IF EXISTS business_reviews_au;`);
        await knex.schema.raw(`DROP TRIGGER IF EXISTS business_reviews_ad;`);

        await knex.schema.raw(`
      CREATE TRIGGER business_reviews_ai
      AFTER INSERT ON business_reviews
      FOR EACH ROW
      BEGIN
        CALL refresh_business_rating(NEW.business_id);
      END;
    `);

        await knex.schema.raw(`
      CREATE TRIGGER business_reviews_au
      AFTER UPDATE ON business_reviews
      FOR EACH ROW
      BEGIN
        CALL refresh_business_rating(NEW.business_id);
      END;
    `);

        await knex.schema.raw(`
      CREATE TRIGGER business_reviews_ad
      AFTER DELETE ON business_reviews
      FOR EACH ROW
      BEGIN
        CALL refresh_business_rating(OLD.business_id);
      END;
    `);
    }
}

async function down(knex) {
    const client = knex.client.config.client || '';

    if (client.includes('pg')) {
        await knex.schema.raw(`DROP TRIGGER IF EXISTS business_reviews_refresh ON business_reviews;`);
        await knex.schema.raw(`DROP FUNCTION IF EXISTS trg_refresh_business_rating();`);
        await knex.schema.raw(`DROP FUNCTION IF EXISTS refresh_business_rating(BIGINT);`);
    } else if (['mysql', 'mysql2'].includes(client)) {
        await knex.schema.raw(`DROP TRIGGER IF EXISTS business_reviews_ai;`);
        await knex.schema.raw(`DROP TRIGGER IF EXISTS business_reviews_au;`);
        await knex.schema.raw(`DROP TRIGGER IF EXISTS business_reviews_ad;`);
        await knex.schema.raw(`DROP PROCEDURE IF EXISTS refresh_business_rating;`);
    }

    await knex.schema.dropTableIfExists('business_reviews');

    await knex.schema.alterTable('businesses', (table) => {
        table.dropColumn('rating_half_stars');
        table.dropColumn('review_count');
    });
}

module.exports = { up, down };
