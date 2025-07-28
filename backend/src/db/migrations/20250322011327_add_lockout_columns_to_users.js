exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.integer('failed_attempts').defaultTo(0);
    table.timestamp('lock_until').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('failed_attempts');
    table.dropColumn('lock_until');
  });
};
