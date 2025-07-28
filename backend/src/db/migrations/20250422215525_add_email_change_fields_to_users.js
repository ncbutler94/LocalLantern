exports.up = function(knex) {
  return knex.schema.alterTable('users', table => {
    table.string('pending_email', 255).nullable();
    table.timestamp('verification_token_expires').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', table => {
    table.dropColumn('pending_email');
    table.dropColumn('verification_token_expires');
  });
};
