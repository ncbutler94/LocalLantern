/**
 * volunteer_help_requests detail table
 * ────────────────────────────────────
 *  • Shares the same primary-key `id` as community_posts
 *  • One-to-one: community_posts.id ⇄ volunteer_help_requests.id
 */

exports.up = async function up(knex) {
    await knex.schema.createTable('volunteer_help_requests', (table) => {
        // reference to aggregator row
        table
            .integer('id')
            .unsigned()
            .primary()
            .references('id')
            .inTable('community_posts')
            .onDelete('CASCADE');

        // ENUM for the type of help requested
        table
            .enu('help_type', ['labor', 'staffing', 'skills', 'other'], {
                useNative: true,
                enumName: 'help_type_enum',
            })
            .notNullable();

        // when the help is needed
        table.date('needed_date').notNullable();

        // additional notes / instructions
        table.text('extra_notes');

        // auto-timestamp
        table
            .timestamp('created_at', { useTz: false })
            .defaultTo(knex.fn.now());
    });
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('volunteer_help_requests');
    await knex.raw('DROP TYPE IF EXISTS help_type_enum'); // tidy up enum in Postgres
};
