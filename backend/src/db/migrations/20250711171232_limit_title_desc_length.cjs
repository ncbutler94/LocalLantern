/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
    // community_posts ──────────────────────────────────────────────
    await knex.schema.alterTable('community_posts', (t) => {
        // VARCHAR(50) for title, VARCHAR(1000) for description
        t.string('title', 50).notNullable().alter();
        t.string('description', 1000).notNullable().alter();
    });

    // lost_and_found ──────────────────────────────────────────────
    // (Skip if you already dropped these columns.)
    await knex.schema.alterTable('lost_and_found', (t) => {
        t.string('title', 50).notNullable().alter();
        t.string('description', 1000).notNullable().alter();
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
    // Roll back to TEXT (unlimited) for both columns.
    await knex.schema.alterTable('community_posts', (t) => {
        t.text('title').notNullable().alter();
        t.text('description').notNullable().alter();
    });

    await knex.schema.alterTable('lost_and_found', (t) => {
        t.text('title').notNullable().alter();
        t.text('description').notNullable().alter();
    });
};
