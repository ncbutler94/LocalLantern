// backend/src/db.js
import knexConstructor from 'knex';
import config from '../../knexfile.cjs';

const env = process.env.NODE_ENV || 'development';
const knex = knexConstructor(config[env] || config);

export default knex;
