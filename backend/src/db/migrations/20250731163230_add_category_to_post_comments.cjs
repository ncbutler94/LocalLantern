// migrations/20250731_add_category_to_post_comments.js
// -----------------------------------------------------------------------------
// Adds `category` column to post_comments so each comment can be scoped to
// a particular post type (mirrors post_likes.category).
// Default value "community_post" preserves existing rows.
//
// To run:   npx knex migrate:latest     (or your usual migration command)
// -----------------------------------------------------------------------------

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
    await knex.schema.alterTable('post_comments', (table) => {
        table
            .string('category', 50)
            .notNullable()
            .defaultTo('community_post')
            .comment('Matches post_likes.category; identifies the parent table');

        table.index(['category'], 'post_comments_category_idx');
    });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
    await knex.schema.alterTable('post_comments', (table) => {
        table.dropIndex([], 'post_comments_category_idx');
        table.dropColumn('category');
    });
};
