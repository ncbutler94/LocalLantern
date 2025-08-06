// 20250830_create_comment_likes.js
// -----------------------------------------------------------------------------
// Join-table that records which user liked which comment.
// Mirrors `post_likes`, but references `post_comments.id`.
// -----------------------------------------------------------------------------

/** @param {import('knex').Knex} knex */
exports.up = async function up(knex) {
    await knex.schema.createTable('comment_likes', (t) => {
        t.increments('id').primary();

        t
            .integer('comment_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('post_comments')
            .onDelete('CASCADE');

        t
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('users')
            .onDelete('CASCADE');

        t
            .timestamp('created_at', { useTz: false })
            .defaultTo(knex.fn.now())
            .notNullable();

        // ensure one like per user per comment
        t.unique(['comment_id', 'user_id']);

        t.index(['comment_id']);
        t.index(['user_id']);
    });
};

/** @param {import('knex').Knex} knex */
exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('comment_likes');
};
