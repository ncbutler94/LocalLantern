/**
 * Creates the announcements table.
 * Each row supplements its parent record in community_posts (1-to-1).
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
    const exists = await knex.schema.hasTable('announcements');
    if (exists) return;                       // already created

    await knex.schema.createTable('announcements', table => {
        // Primary key also serves as foreign key -> community_posts.id
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

        table.string('title', 255).notNullable();  // headline
        table.text('body').nullable();             // full announcement text

        table.date('effective_from').nullable();   // start date (optional)
        table.date('effective_to').nullable();     // end date   (optional)

        // Location info mirrors community_posts so filters & map work
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
    if (await knex.schema.hasTable('announcements')) {
        await knex.schema.dropTable('announcements');
    }
};
