// migrations/20250419_add_needs_password_to_users.js
exports.up = async function up(knex) {
  const exists = await knex.schema.hasColumn('users', 'needs_password');
  if (!exists) {
    await knex.schema.alterTable('users', table => {
      table.boolean('needs_password').notNullable().defaultTo(true);
    });
  }

  // clear the flag for accounts that already have a real password
  await knex('users')
      .whereNotNull('password_hash')
      .andWhere('password_hash', '!=', '')
      .update({ needs_password: false });
};

exports.down = async function down(knex) {
  const exists = await knex.schema.hasColumn('users', 'needs_password');
  if (exists) {
    await knex.schema.alterTable('users', table => {
      table.dropColumn('needs_password');
    });
  }
};
