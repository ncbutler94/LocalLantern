exports.up = function(knex) {
  return knex.schema.table('users', function(table) {
    table.string('reset_token').nullable();
    table.timestamp('reset_token_expires').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('users', function(table) {
    table.dropColumn('reset_token');
    table.dropColumn('reset_token_expires');
  });
};
