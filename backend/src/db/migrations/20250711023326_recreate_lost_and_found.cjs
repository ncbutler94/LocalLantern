/**
 * Re-creates the lost_and_found table if it doesn't exist.
 * Matches the schema expected by the API code.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
    const exists = await knex.schema.hasTable('lost_and_found');
    if (exists) return;                   // already there, nothing to do

    await knex.schema.createTable('lost_and_found', table => {
        table
            .integer('id')
            .unsigned()
            .primary()
            .references('id')
            .inTable('community_posts')
            .onDelete('CASCADE');

        table
            .timestamp('date_created')
            .notNullable()
            .defaultTo(knex.fn.now());

        table
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('users')
            .onDelete('CASCADE');

        table.string('title', 255).notNullable();
        table.text('description').nullable();
        table.enu('lost_or_found', ['lost', 'found']).notNullable();
        table.decimal('reward', 10, 2).nullable();
        table.string('street_address', 255).nullable();
        table.string('city',   100).nullable();
        table.string('county', 100).nullable();
        table.decimal('latitude',  9, 6).nullable();
        table.decimal('longitude', 9, 6).nullable();
    });
};

/**
 * Drops the table on rollback.
 *
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
    if (await knex.schema.hasTable('lost_and_found')) {
        await knex.schema.dropTable('lost_and_found');
    }
};
