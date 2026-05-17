const express = require('express')
const dotenv = require('dotenv')
const { createClient } = require('redis')
const cors = require('cors')
const logger = require('../shared/logger')('auth-service')
const pool = require('../shared/db')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const metrics = require('../shared/metrics')

const redisClient = createClient({
  url: 'redis://redis:6379'
})

redisClient
  .connect()
  .then(() => console.log('✅ Redis Connected'))
  .catch(err => console.log(err))

dotenv.config()
let requestCount = 0
let errorCount = 0

dotenv.config()

const app = express()

app.use((req, res, next) => {
  requestCount++
  metrics.requestCounter.inc()

  next()
})
app.use(express.json())
app.use(helmet())

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  })
)
/* ---------------- HEALTH ---------------- */

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')

    res.json({
      service: 'user-service',
      status: 'UP'
    })
  } catch (err) {
    errorCount++

    res.status(500).json({
      status: 'DOWN',
      error: err.message
    })
  }
})

/* ---------------- GET PROFILE ---------------- */

app.get('/profile', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']
    const cacheKey = `user:${userId}`

    const cachedUser = await redisClient.get(cacheKey)

    if (cachedUser) {
      return res.json(JSON.parse(cachedUser))
    }

    const result = await pool.query(
      'SELECT id,name,email FROM users WHERE id=$1',
      [userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'User not found'
      })
    }

    await redisClient.set(cacheKey, JSON.stringify(result.rows[0]), { EX: 60 })

    res.json(result.rows[0])
  } catch (err) {
    errorCount++
    res.status(500).json({
      error: 'Failed to fetch profile'
    })
  }
})

/* ---------------- UPDATE PROFILE ---------------- */

app.put('/profile', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']
    const { name } = req.body

    const result = await pool.query(
      'UPDATE users SET name=$1 WHERE id=$2 RETURNING id,name,email',
      [name, userId]
    )

    res.json({
      message: 'Profile updated',
      user: result.rows[0]
    })
  } catch {
    res.status(500).json({
      error: 'Update failed'
    })
  }
})

/* ---------------- DELETE USER ---------------- */

app.delete('/profile', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']

    await pool.query('DELETE FROM users WHERE id=$1', [userId])

    res.json({
      message: 'User deleted'
    })
  } catch {
    res.status(500).json({
      error: 'Delete failed'
    })
  }
})

app.get('/stats', (req, res) => {
  res.json({
    requestCount,
    errorCount
  })
})

/* ---------------- SERVER ---------------- */

const PORT = process.env.USER_PORT || 4002

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.client.register.contentType)

  res.end(await metrics.client.register.metrics())
})

app.get('/stats', (req, res) => {
  res.json({
    requestCount,

    errorCount
  })
})

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`)
})
