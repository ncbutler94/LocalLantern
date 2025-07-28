/* eslint-disable camelcase */

/**
 * @param { import('knex').Knex } knex
 * Generates the `recommendations_and_tips` table.
 *
 * Columns keep parity with your other post tables (announcements, lost_and_found, etc.)
 * so the same backend utilities (middleware for auth, file-upload helpers, etc.)
 * will slot straight in.
 */
exports.up = async function up(knex) {
    await knex.schema.createTable('recommendations_and_tips', (t) => {
        t.increments('id').primary();                       // PK
        t.timestamp('date_created').defaultTo(knex.fn.now());

        /* ─────────────────── poster info ─────────────────── */
        t.integer('user_id').unsigned().notNullable()
            .references('id')
            .inTable('users')
            .onDelete('CASCADE');

        /* ─────────────────── content ─────────────────────── */
        t.string('title', 255).notNullable();
        t.text('description').notNullable();                // aka “body”

        /* “business” | “tip” (enum keeps data tidy) */
        t.enu('rec_type', ['business', 'tip']).notNullable();

        /* ─────────────────── optional location ───────────── */
        t.string('city',   100);
        t.string('county', 100);
        t.decimal('latitude',  9, 6);                       //  ±90.000000
        t.decimal('longitude', 9, 6);                       // ±180.000000

        /* ─────────────────── media ───────────────────────── */
        // Array of GCS URLs (null = no images)
        // • PostgreSQL: JSON or text[] works; JSON is more portable
        // • MySQL: use JSON
        t.json('photos');
    });

    /* Handy composite index for map + filter queries */
    await knex.schema.alterTable('recommendations_and_tips', (t) => {
        t.index(['county', 'rec_type']);
        t.index(['latitude', 'longitude']);
    });
};

/**
 * Rollback – drop the table.
 */
exports.down = function down(knex) {
    return knex.schema.dropTableIfExists('recommendations_and_tips');
};
