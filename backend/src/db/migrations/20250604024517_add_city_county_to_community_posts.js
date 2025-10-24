// File: src/migrations/20250604024517_add_city_county_to_community_posts.js
// (using ES module syntax)

export async function up(knex) {
    await knex.schema.alterTable('community_posts', (table) => {
        table.string('city');
        table.string('county');
    });
}

export async function down(knex) {
    await knex.schema.alterTable('community_posts', (table) => {
        table.dropColumn('city');
        table.dropColumn('county');
    });
}
