const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASS || 'admin123',
  database: process.env.DB_NAME || 'selfhealing',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
})

pool.on('connect', () => {
  console.log('Database connected')
})

pool.on('error', err => {
  console.error('Unexpected DB error:', err)
})

module.exports = pool