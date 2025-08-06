/* eslint-disable camelcase */
exports.up = async function up(knex) {
    await knex.schema.createTable('post_comments', (table) => {
        table.increments('id').primary();            // INT UNSIGNED AUTO_INCREMENT PK
        table.integer('post_id').unsigned().notNullable()
            .references('id').inTable('community_posts')  // adjust if your post table has different name
            .onDelete('CASCADE');

        table.integer('user_id').unsigned().notNullable()
            .references('id').inTable('users')
            .onDelete('CASCADE');

        table.text('content').notNullable();

        // reply hierarchy
        table.integer('parent_id').unsigned().nullable()
            .references('id').inTable('post_comments')
            .onDelete('CASCADE');

        table.integer('root_id').unsigned().nullable()
            .references('id').inTable('post_comments')
            .onDelete('CASCADE');

        table.integer('reply_count').unsigned().notNullable().defaultTo(0);

        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.string('category', 50).nullable();

        // helpful indexes
        table.index('post_id');
        table.index('parent_id');
        table.index('root_id');
    });
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('post_comments');
};
