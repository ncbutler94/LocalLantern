// migrations/20250330123456_add_social_columns_to_users.js

exports.up = function(knex) {
  return knex.schema.table('users', function(table) {
    table.string('google_id').nullable();
    table.string('facebook_id').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('google_id');
    table.dropColumn('facebook_id');
  });
};
