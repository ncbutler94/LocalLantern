// CommonJS migration
exports.up = async function up(knex) {
    const exists = await knex.schema.hasTable('business_deals');
    if (exists) return;

    await knex.schema.createTable('business_deals', (t) => {
        t.increments('id').primary();
        t.integer('business_id').unsigned().notNullable()
            .references('id').inTable('businesses').onDelete('CASCADE');
        t.string('title', 300).notNullable();
        t.text('description');
        t.string('url', 600);
        t.string('promo_code', 120);
        t.datetime('starts_at');
        t.datetime('ends_at');
        t.boolean('active').notNullable().defaultTo(1);
        t.timestamps(true, true);
    });
};

exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('business_deals');
};
