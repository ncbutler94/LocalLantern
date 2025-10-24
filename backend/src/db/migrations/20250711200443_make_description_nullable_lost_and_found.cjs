// migrations/20250711_2252_make_description_nullable_lost_and_found.js
/**
 * Make lost_and_found.description nullable.
 *
 * Uses raw SQL for MySQL compatibility; adjust the field
 * type if your column isn’t TEXT.
 */

exports.up = async function up(knex) {
    await knex.raw(`
    ALTER TABLE lost_and_found
      MODIFY description TEXT NULL
  `);
};

exports.down = async function down(knex) {
    await knex.raw(`
    ALTER TABLE lost_and_found
      MODIFY description TEXT NOT NULL
  `);
};
