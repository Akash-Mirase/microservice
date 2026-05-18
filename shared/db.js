const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASS || 'admin123',
  database: process.env.DB_NAME || 'self_healing',

  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
})

async function connectWithRetry () {

  while (true) {

    try {

      await pool.query('SELECT 1')

      console.log('✅ Database connected')

      break

    } catch (err) {

      console.log('⏳ Retrying DB connection in 5 seconds...')
      console.error(err.message)

      await new Promise(resolve =>
        setTimeout(resolve, 5000)
      )
    }
  }
}

connectWithRetry()

pool.on('error', err => {
  console.error('Unexpected DB error:', err)
})

module.exports = pool