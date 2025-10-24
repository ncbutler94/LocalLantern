// migrations/2025XXXXXXXXXX_restore_post_comments.js

/**
 * Re-create the post_comments table after accidental drop.
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

        table.text('content').notNullable();

        table
            .integer('parent_id')
            .unsigned()
            .nullable()
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
