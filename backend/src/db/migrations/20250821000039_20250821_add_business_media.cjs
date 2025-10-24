// CommonJS on purpose so `knex migrate:latest` loads cleanly.
'use strict';

/**
 * Tables:
 *  - business_media:   each photo/video with caption + sort
 *  - business_media_comments: comments on a single media item
 *  - business_media_likes:    unique like per user & media
 */
module.exports.up = async function up(knex) {
    await knex.schema.createTable('business_media', (t) => {
        t.increments('id').primary();
        t.integer('business_id').unsigned().notNullable().index()
            .references('id').inTable('businesses').onDelete('CASCADE');
        t.integer('user_id').unsigned().nullable().index()
            .references('id').inTable('users').onDelete('SET NULL');

        t.string('type', 16).notNullable(); // 'photo' | 'video'
        t.text('url').notNullable();
        t.text('caption').nullable();
        t.integer('sort_order').notNullable().defaultTo(0);

        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('business_media_comments', (t) => {
        t.increments('id').primary();
        t.integer('media_id').unsigned().notNullable().index()
            .references('id').inTable('business_media').onDelete('CASCADE');
        t.integer('user_id').unsigned().notNullable().index()
            .references('id').inTable('users').onDelete('CASCADE');
        t.text('text').notNullable();
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(knex.fn.now());
    });

    await knex.schema.createTable('business_media_likes', (t) => {
        t.increments('id').primary();
        t.integer('media_id').unsigned().notNullable().index()
            .references('id').inTable('business_media').onDelete('CASCADE');
        t.integer('user_id').unsigned().notNullable().index()
            .references('id').inTable('users').onDelete('CASCADE');
        t.unique(['media_id', 'user_id']); // one like per user per media
        t.timestamp('created_at').defaultTo(knex.fn.now());
    });

    // helpful compound index for listing media
    await knex.schema.alterTable('business_media', (t) => {
        t.index(['business_id', 'sort_order', 'created_at']);
        t.index(['business_id', 'type']);
    });
};

module.exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('business_media_likes');
    await knex.schema.dropTableIfExists('business_media_comments');
    await knex.schema.dropTableIfExists('business_media');
};
