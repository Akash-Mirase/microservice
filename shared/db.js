const { Pool } = require('pg');

const pool = new Pool({
host: 'postgres',
user: 'admin',
password: 'admin123',
database: 'selfhealing',
port: 5432
});

module.exports = pool;