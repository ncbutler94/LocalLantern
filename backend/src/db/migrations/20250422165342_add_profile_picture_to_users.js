// backend/src/migrations/20250422030436_add_profile_fields_to_users.js

exports.up = function(knex) {
  return knex.schema.alterTable('users', table => {
    table.string('profile_picture', 255).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', table => {
    table.dropColumn('profile_picture');
  });
};
