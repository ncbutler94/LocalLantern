exports.up = async (knex) => {
    await knex.schema.createTable('community_announcements', (t) => {
        t.integer('post_id').unsigned().primary();      // ← match INT UNSIGNED
        t.foreign('post_id')
            .references('id')
            .inTable('community_posts')
            .onDelete('CASCADE');
    });
};

exports.down = async (knex) => {
    await knex.schema.dropTableIfExists('community_announcements');
};
