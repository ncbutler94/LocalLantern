/**
 * @param { import("knex").Knex } knex
 */
export async function up(knex) {
    // 1) Determine which columns already exist
    const hasCategory     = await knex.schema.hasColumn('community_posts','category');
    const hasDateCreated  = await knex.schema.hasColumn('community_posts','date_created');
    const candidatesToDrop = [
        'title','description','subtype','location_name',
        'city','county','latitude','longitude',
        'user_id','posted_at'
    ];
    const drops = [];
    for (const col of candidatesToDrop) {
        if (await knex.schema.hasColumn('community_posts', col)) {
            drops.push(col);
        }
    }

    // 2) Alter community_posts in one synchronous callback
    await knex.schema.alterTable('community_posts', table => {
        // add new columns if missing
        if (!hasCategory)    table.string('category').notNullable().defaultTo('');
        if (!hasDateCreated) table.timestamp('date_created').notNullable().defaultTo(knex.fn.now());

        // drop old columns that actually exist
        for (const col of drops) {
            table.dropColumn(col);
        }
    });

    // 3) Create lost_and_found if not already present
    if (!(await knex.schema.hasTable('lost_and_found'))) {
        await knex.schema.createTable('lost_and_found', table => {
            table.integer('id').unsigned().primary()
                .references('id').inTable('community_posts')
                .onDelete('CASCADE');

            table.timestamp('date_created').notNullable().defaultTo(knex.fn.now());
            table.integer('user_id').unsigned().notNullable()
                .references('id').inTable('users')
                .onDelete('CASCADE');

            table.string('title', 255).notNullable();
            table.text('description').nullable();
            table.enu('lost_or_found', ['lost','found']).notNullable();
            table.decimal('reward', 10, 2).nullable();
            table.string('street_address', 255).nullable();
            table.string('city', 100).nullable();
            table.string('county', 100).nullable();

            table.decimal('latitude', 9, 6).nullable();
            table.decimal('longitude', 9, 6).nullable();
        });
    }
}

/**
 * @param { import("knex").Knex } knex
 */
export async function down(knex) {
    // 1) Drop the helper table if it exists
    if (await knex.schema.hasTable('lost_and_found')) {
        await knex.schema.dropTable('lost_and_found');
    }

    // 2) Restore community_posts old columns
    const hasCategory    = await knex.schema.hasColumn('community_posts','category');
    const hasDateCreated = await knex.schema.hasColumn('community_posts','date_created');
    await knex.schema.alterTable('community_posts', table => {
        if (hasCategory)    table.dropColumn('category');
        if (hasDateCreated) table.dropColumn('date_created');

        // re-create old columns (no harm if they already exist):
        table.string('title', 255);
        table.text('description');
        table.string('subtype');
        table.string('location_name');
        table.string('city');
        table.string('county');
        table.decimal('latitude', 9, 6);
        table.decimal('longitude', 9, 6);
        table.integer('user_id').unsigned();
        table.timestamp('posted_at');
    });
}
