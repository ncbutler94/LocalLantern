// backend/migrations/xxxxxx_add_contact_to_volunteer_help_requests.js

exports.up = function (knex) {
    return knex.schema.alterTable('volunteer_help_requests', (table) => {
        table.string('contact', 255).notNullable().defaultTo('');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('volunteer_help_requests', (table) => {
        table.dropColumn('contact');
    });
};
