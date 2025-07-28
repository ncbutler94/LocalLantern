// src/migrations/20250709003216_create_community_categories.js
/**
 * @param {import('knex').Knex} knex
 */
module.exports.up = async function up(knex) {
    await knex.schema.createTable('community_categories', t => {
        t.string('slug', 50).primary();
        t.string('label', 100).notNullable();
    });

    await knex('community_categories').insert([
        { slug: 'announcements',             label: 'Announcements' },
        { slug: 'general-discussion',        label: 'General Discussion' },
        { slug: 'lost-and-found',            label: 'Lost & Found' },
        { slug: 'public-safety-alerts',      label: 'Public Safety Alerts' },
        { slug: 'recommendations-tips',      label: 'Recommendations & Tips' },
        { slug: 'volunteer-help-requests',   label: 'Volunteer & Help Requests' }
    ]);
};

module.exports.down = async function down(knex) {
    await knex.schema.dropTableIfExists('community_categories');
};
