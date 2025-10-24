// migrations/20250430_create_community_posts.js

exports.up = function(knex) {
  return knex.schema.createTable('community_posts', table => {
    table.increments('id').primary();
    table.string('title', 255).notNullable();
    table.text('description').notNullable();
    table.string('subtype', 100).notNullable();
    table.string('location_name', 255);
    table.string('city', 100);
    table.string('county', 100);
    table.decimal('latitude', 9, 6);
    table.decimal('longitude', 9, 6);
    table
        .integer('user_id')
        .unsigned()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
        .index();
    table
        .timestamp('posted_at')
        .notNullable()
        .defaultTo(knex.fn.now());
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('community_posts');
};
