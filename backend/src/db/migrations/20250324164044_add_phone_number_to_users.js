exports.up = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.string('phone_number', 20).nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', function(table) {
    table.dropColumn('phone_number');
  });
};
