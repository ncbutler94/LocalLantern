// backend/knexfile.cjs
const path = require('path');

module.exports = {
    development: {
        client: 'mysql2',
        connection: {
            host    : '127.0.0.1',
            port    : 3306,                 // ← add or update this line
            user    : 'root',               // adjust creds
            password: 'root',
            database: 'thelocallantern',
            charset : 'utf8mb4'
        },
        migrations: {
            directory: path.join(__dirname, 'src', 'db', 'migrations'),
            tableName: 'knex_migrations'
        }
    }
};
