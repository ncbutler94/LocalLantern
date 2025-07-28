// backend/src/migrations/20250320000000_add_verification_fields_to_users.js

exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    // Add a boolean column to track if the user's email is verified; default is false.
    table.boolean('is_verified').defaultTo(false);
    // Add a string column to store a verification token if needed.
    table.string('verification_token', 255).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('is_verified');
    table.dropColumn('verification_token');
  });
};
