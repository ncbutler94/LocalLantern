/**
 * Add `category` to post_likes and a new UNIQUE (category,post_id,user_id).
 * CommonJS version (.cjs) so Knex can load it without ES-modules.
 *
 * @param {import('knex').Knex} knex
 */

exports.up = async function up(knex) {
    /* 1. add column if it isn’t there yet ---------------------------------- */
    const hasCol = await knex.schema.hasColumn('post_likes', 'category');
    if (!hasCol) {
        await knex.schema.alterTable('post_likes', tbl => {
            tbl
                .enu('category', [
                    'community_post',
                    'lost_and_found',
                    'job',
                    'event'
                ])
                .nullable()                 // allow back-fill first
                .after('post_id');          // comment out on Postgres
        });
    }

    /* 2. back-fill NULLs with default -------------------------------------- */
    await knex('post_likes')
        .whereNull('category')
        .update({ category: 'community_post' });

    /* 3. make column NOT NULL + default for new rows ----------------------- */
    await knex.schema.alterTable('post_likes', tbl => {
        tbl
            .enu('category', [
                'community_post',
                'lost_and_found',
                'job',
                'event'
            ])
            .notNullable()
            .defaultTo('community_post')
            .alter();
    });

    /* 4. add new composite unique key (leave old one in place) ------------- */
    await knex.schema.alterTable('post_likes', tbl => {
        try {
            tbl.unique(
                ['category', 'post_id', 'user_id'],
                'post_likes_category_post_user_unique'
            );
        } catch (_) {
            /* index already exists – ignore */
        }
    });
};

exports.down = async function down(knex) {
    await knex.schema.alterTable('post_likes', tbl => {
        tbl.dropUnique(
            ['category', 'post_id', 'user_id'],
            'post_likes_category_post_user_unique'
        );
        tbl.dropColumn('category');
    });
};
