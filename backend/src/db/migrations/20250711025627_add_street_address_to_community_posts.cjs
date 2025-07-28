// migrations/20250711023000_add_street_address_to_community_posts.cjs
exports.up = knex =>
    knex.schema.alterTable('community_posts', t => {
        t.string('street_address', 255).nullable();
    });

exports.down = knex =>
    knex.schema.alterTable('community_posts', t => {
        t.dropColumn('street_address');
    });
