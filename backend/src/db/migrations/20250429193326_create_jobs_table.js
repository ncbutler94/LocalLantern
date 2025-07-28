// migrations/2025MMDDHHMMSS_create_jobs_table.js

exports.up = function(knex) {
  return knex.schema.createTable('jobs', table => {
    table.increments('id').primary();
    table.string('title', 255).notNullable();
    table.text('description');
    table.string('location', 255);
    table.string('city', 100);
    table.string('county', 100);
    table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
        .onUpdate('CASCADE');
    table.timestamps(true, true); // created_at & updated_at, defaults to now()
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('jobs');
};
