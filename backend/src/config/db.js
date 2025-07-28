// backend/src/config/db.js
import knex from 'knex';
import knexfile from '../../knexfile.cjs';

const environment   = process.env.NODE_ENV || 'development';
const configOptions = knexfile[environment];

const db = knex(configOptions);

export default db;
