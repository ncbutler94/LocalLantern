// migrations/20250711_2245_make_description_nullable.js
/**
 * Make community_posts.description nullable
 *
 * Works on MySQL 5.7+/8.x using knex.raw() to ALTER the column,
 * because knex's .alter() helper is still finicky with MySQL.
 */

exports.up = async function up(knex) {
    await knex.raw(`
    ALTER TABLE community_posts
      MODIFY description TEXT NULL
  `);
};

exports.down = async function down(knex) {
    await knex.raw(`
    ALTER TABLE community_posts
      MODIFY description TEXT NOT NULL
  `);
};
