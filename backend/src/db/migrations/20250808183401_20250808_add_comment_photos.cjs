// backend/migrations/20250808_add_comment_photos.js
exports.up = (knex) =>
    knex.schema.createTable('comment_photos', (t) => {
        t.increments('id').primary();
        t.integer('comment_id').unsigned().notNullable()
            .references('id').inTable('post_comments').onDelete('CASCADE');
        t.string('url', 600).notNullable();
        t.integer('position').defaultTo(0);
    });

exports.down = (knex) => knex.schema.dropTableIfExists('comment_photos');
