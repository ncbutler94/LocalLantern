exports.up = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    // Add a column to store a temporary two-factor code (e.g., 6-digit numeric code)
    table.string('two_factor_code', 10).nullable();
    // Add a column to store the expiration time for the two-factor code
    table.timestamp('two_factor_expires').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('two_factor_code');
    table.dropColumn('two_factor_expires');
  });
};
