exports.up = async function (knex) {
    await knex.schema.createTable('community_photos', (table) => {
        // Primary key – use the SAME size as community_posts.id
        table.increments('id').primary();           // INT UNSIGNED

        table
            .integer('post_id')                       // INT UNSIGNED
            .unsigned()
            .notNullable()
            .references('id')
            .inTable('community_posts')
            .onDelete('CASCADE');

        table.string('url', 255).notNullable();
        table.integer('position').unsigned().defaultTo(0);
        table.string('alt_text', 255);
        table.timestamp('created_at').defaultTo(knex.fn.now());

        table.index('post_id');
        table.unique(['post_id', 'position']);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('community_photos');
};
