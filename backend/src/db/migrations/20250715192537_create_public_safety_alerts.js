/** @param {import('knex').Knex} knex */
export async function up(knex) {
    await knex.schema.createTable('public_safety_alerts', table => {
        // PK / FK to community_posts.id – INT UNSIGNED to match parent
        table.integer('id').unsigned().notNullable().primary();

        table.integer('user_id').unsigned().notNullable();       // author
        table.timestamp('date_created').notNullable().defaultTo(knex.fn.now());

        /* core post data */
        table.string('title', 50).notNullable();
        table.text('body', 'mediumtext').nullable();
        table.string('city',   100).nullable();
        table.string('county', 100).notNullable();

        /* geo */
        table.decimal('latitude',  10, 7).nullable();
        table.decimal('longitude', 10, 7).nullable();

        /* category-specific fields */
        table
            .enu('severity', ['info', 'caution', 'danger'], {
                useNative: true,
                enumName: 'psa_severity'
            })
            .notNullable()
            .defaultTo('info');

        table
            .enu(
                'alert_type',
                ['weather','road','police','fire','missing','animal','utility','other'],
                { useNative: true, enumName: 'psa_type' }
            )
            .notNullable()
            .defaultTo('other');

        table.string('alert_type_other', 30).nullable();
        table.dateTime('expires_at').nullable();

        /* foreign keys */
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
    await knex.schema.dropTableIfExists('public_safety_alerts');
}
