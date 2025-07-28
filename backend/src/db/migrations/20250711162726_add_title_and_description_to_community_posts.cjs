/**
 * @param { import("knex").Knex } knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('community_posts', (t) => {
        t.string('title').notNullable();
        t.text('description').notNullable();
    });
};

/**
 * @param { import("knex").Knex } knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('community_posts', (t) => {
        t.dropColumn('title');
        t.dropColumn('description');
    });
};
