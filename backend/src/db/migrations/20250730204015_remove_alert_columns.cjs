// Knex migration: remove obsolete alert columns from public_safety_alerts

/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
    return knex.schema.alterTable('public_safety_alerts', (table) => {
        table.dropColumn('severity');
        table.dropColumn('alert_type');
        table.dropColumn('alert_type_other');
    });
};

/**
 * Re‑introduce the dropped columns (rollback support).
 * Adjust the enum/string definitions to whatever they were originally.
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
    return knex.schema.alterTable('public_safety_alerts', (table) => {
        // Enum values recreated as an example – replace / expand if your original enum differed.
        table.enum('severity', ['info', 'caution', 'danger']).defaultTo('info');
        table.string('alert_type', 255);
        table.string('alert_type_other', 255);
    });
};
