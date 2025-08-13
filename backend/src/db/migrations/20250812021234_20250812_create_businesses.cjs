// server/migrations/20250812_create_businesses.js
/**
 * Creates businesses, business_owners, and business_claims tables.
 * Includes `verified` boolean and a `status` for moderation lifecycle.
 */
exports.up = async function (knex) {
    await knex.schema.createTable('businesses', (t) => {
        t.increments('id').primary();
        t.string('name').notNullable();
        t.string('slug').notNullable().unique();
        t.string('category').notNullable();

        t.text('description');
        t.string('logo_url');
        t.string('cover_url');

        t.string('contact_email').notNullable().index();
        t.string('phone');
        t.string('website');

        t.string('street_address');
        t.string('city').index();
        t.string('county').index();
        t.decimal('latitude', 10, 6);
        t.decimal('longitude', 10, 6);

        t.boolean('verified').notNullable().defaultTo(false); // <- important
        t.enu('status', ['pending', 'active', 'suspended', 'archived'], {
            useNative: true,
            enumName: 'business_status'
        }).notNullable().defaultTo('pending');

        t.timestamps(true, true);
    });

    await knex.schema.createTable('business_owners', (t) => {
        t.increments('id').primary();
        t.integer('business_id').unsigned().notNullable()
            .references('id').inTable('businesses').onDelete('CASCADE');
        t.integer('user_id').unsigned().notNullable()
            .references('id').inTable('users').onDelete('CASCADE');
        t.enu('role', ['owner', 'manager', 'editor'], {
            useNative: true,
            enumName: 'business_role'
        }).notNullable().defaultTo('owner');
        t.timestamps(true, true);
        t.unique(['business_id', 'user_id']);
    });

    await knex.schema.createTable('business_claims', (t) => {
        t.increments('id').primary();
        t.integer('business_id').unsigned().notNullable()
            .references('id').inTable('businesses').onDelete('CASCADE');
        t.string('email').notNullable().index();
        t.string('token').notNullable().unique();
        t.timestamp('expires_at').notNullable();
        t.timestamp('consumed_at').nullable();
        t.timestamps(true, true);
    });
};

exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('business_claims');
    await knex.schema.dropTableIfExists('business_owners');
    await knex.schema.dropTableIfExists('businesses');
    await knex.raw('DROP TYPE IF EXISTS business_role');
    await knex.raw('DROP TYPE IF EXISTS business_status');
};
