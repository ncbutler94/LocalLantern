// CommonJS migration
exports.up = async function up(knex) {
    const has = (col) => knex.schema.hasColumn('businesses', col);

    // Add columns one-by-one only if missing (idempotent)
    if (!(await has('long_description'))) {
        await knex.schema.alterTable('businesses', (t) => { t.text('long_description'); });
    }
    if (!(await has('hours_json'))) {
        await knex.schema.alterTable('businesses', (t) => { t.text('hours_json'); }); // JSON string
    }
    if (!(await has('gallery_urls'))) {
        await knex.schema.alterTable('businesses', (t) => { t.text('gallery_urls'); }); // JSON array string
    }
    if (!(await has('facebook_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('facebook_url', 600); });
    }
    if (!(await has('instagram_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('instagram_url', 600); });
    }
    if (!(await has('twitter_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('twitter_url', 600); });
    }
    if (!(await has('youtube_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('youtube_url', 600); });
    }
    if (!(await has('tiktok_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('tiktok_url', 600); });
    }
    if (!(await has('menu_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('menu_url', 600); });
    }
    if (!(await has('booking_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('booking_url', 600); });
    }
    if (!(await has('store_url'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('store_url', 600); });
    }
    if (!(await has('price_range'))) {
        await knex.schema.alterTable('businesses', (t) => { t.string('price_range', 50); });
    }
    if (!(await has('amenities_json'))) {
        await knex.schema.alterTable('businesses', (t) => { t.text('amenities_json'); }); // JSON string
    }
    // Optional cached stats (safe if you later populate them)
    if (!(await has('rating_half_stars'))) {
        await knex.schema.alterTable('businesses', (t) => { t.integer('rating_half_stars').defaultTo(0); });
    }
    if (!(await has('review_count'))) {
        await knex.schema.alterTable('businesses', (t) => { t.integer('review_count').defaultTo(0); });
    }
};

exports.down = async function down(knex) {
    // Drop columns if present
    const dropIf = async (col) => {
        if (await knex.schema.hasColumn('businesses', col)) {
            await knex.schema.alterTable('businesses', (t) => { t.dropColumn(col); });
        }
    };

    await dropIf('long_description');
    await dropIf('hours_json');
    await dropIf('gallery_urls');
    await dropIf('facebook_url');
    await dropIf('instagram_url');
    await dropIf('twitter_url');
    await dropIf('youtube_url');
    await dropIf('tiktok_url');
    await dropIf('menu_url');
    await dropIf('booking_url');
    await dropIf('store_url');
    await dropIf('price_range');
    await dropIf('amenities_json');
    await dropIf('rating_half_stars');
    await dropIf('review_count');
};
