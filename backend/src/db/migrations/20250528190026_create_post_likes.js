// migrations/2025XXXXXXXXXX_create_post_likes.js

/**
 * Creates a table to track which users have liked which posts.
 */
export async function up(knex) {
    await knex.schema.createTable('post_likes', table => {
        table.increments('id').primary();
        table
            .integer('post_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('community_posts')
            .onDelete('CASCADE');
        table
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('users')
            .onDelete('CASCADE');
        table
            .timestamp('created_at')
            .notNullable()
            .defaultTo(knex.fn.now());

        // one like per user per post
        table.unique(['post_id', 'user_id']);
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('post_likes');
}
