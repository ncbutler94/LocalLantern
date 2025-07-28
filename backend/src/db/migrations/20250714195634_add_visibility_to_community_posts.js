// migrations/20250714_add_visibility_to_community_posts.js
export async function up(knex) {
    const hasCol = await knex.schema.hasColumn('community_posts', 'visibility');
    if (!hasCol) {
        await knex.schema.alterTable('community_posts', (t) => {
            t
                .enu('visibility', ['public', 'followers'])
                .notNullable()
                .defaultTo('public');
        });
    }
}

export async function down(knex) {
    await knex.schema.alterTable('community_posts', (t) => {
        t.dropColumn('visibility');
    });
}
