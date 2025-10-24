// migrations/20250510030534_create_community_categories_table.js

/**
 * Create a table to store community categories.
 */
export async function up(knex) {
    await knex.schema.createTable('community_categories', table => {
        table.increments('id').primary();
        table.string('slug').notNullable().unique(); // e.g. 'lost-and-found'
        table.string('label').notNullable();         // e.g. 'Lost & Found'
        table.timestamps(true, true);
    });
}

/**
 * Drop the community_categories table if we roll back.
 */
export async function down(knex) {
    await knex.schema.dropTableIfExists('community_categories');
}
