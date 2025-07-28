// migrations/20250528155001_create_lost_and_found_photos.js
/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function up(knex) {
    await knex.schema.createTable('lost_and_found_photos', table => {
        table.increments('id').primary();
        table
            .integer('lost_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('lost_and_found')
            .onDelete('CASCADE')
            .index();
        table.string('url', 1024).notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
    });
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
export async function down(knex) {
    await knex.schema.dropTableIfExists('lost_and_found_photos');
}
