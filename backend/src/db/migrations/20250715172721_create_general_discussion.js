/** @param {import('knex').Knex} knex */
export async function up(knex) {
    await knex.schema.createTable('general_discussion', table => {
        // PK / FK — INT UNSIGNED to match community_posts.id  👇
        table.integer('id').unsigned().notNullable().primary();

        /* core metadata */
        table.timestamp('date_created').notNullable().defaultTo(knex.fn.now());
        table.integer('user_id').unsigned().notNullable();

        /* post content */
        table.string('title', 50).notNullable();
        table.text('body', 'mediumtext').nullable();         // same as announcements.body
        table.string('city',   100).nullable();
        table.string('county', 100).notNullable();

        /* geo */
        table.decimal('latitude',  10, 7).nullable();        // ±90.0000000
        table.decimal('longitude', 10, 7).nullable();        // ±180.0000000

        /* FK constraints */
        table
            .foreign('id')
            .references('community_posts.id')
            .onDelete('CASCADE');

        table
            .foreign('user_id')
            .references('users.id')
            .onDelete('CASCADE');
    });
}

export async function down(knex) {
    await knex.schema.dropTableIfExists('general_discussion');
}
