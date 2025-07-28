// migrations/2025XXXXXXXXXX_create_post_comments.js

/**
 * Creates a table to store comments on community posts.
 */
export async function up(knex) {
    await knex.schema.createTable('post_comments', table => {
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

        // The comment body
        table.text('content').notNullable();

        // Optional parent comment for threading
        table
            .integer('parent_id')
            .unsigned()
            .references('id')
            .inTable('post_comments')
            .onDelete('SET NULL');

        table
            .timestamp('created_at')
            .notNullable()
            .defaultTo(knex.fn.now());
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('post_comments');
}
