const express = require('express')
const dotenv = require('dotenv')
const axios = require('axios')
const { Kafka } = require('kafkajs')
const CircuitBreaker = require('opossum')
const cors = require('cors')
const logger = require('../shared/logger')('auth-service')
const pool = require('../shared/db')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const metrics = require('../shared/metrics')

dotenv.config()

let requestCount = 0
let errorCount = 0

const app = express()

app.use(cors())
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

/* KAFKA */

const kafka = new Kafka({
  clientId: 'order-service',
  brokers: ['kafka:9092']
})

const producer = kafka.producer()

async function connectKafka () {
  while (true) {
    try {
      await producer.connect()
      console.log('✅ Kafka Producer Connected')
      break
    } catch (err) {
      errorCount++
      console.log('⏳ Waiting for Kafka...')
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}

connectKafka()

/* HEALTH */

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')

    res.json({
      service: 'order-service',
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

async function paymentCall (data) {
  const res = await axios.post('http://payment-service:4004/pay', data)
  return res.data
}

const breaker = new CircuitBreaker(paymentCall, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 5000
})

breaker.fallback(() => {
  return { status: 'PENDING', message: 'Payment delayed' }
})

/* CREATE ORDER */

app.post('/create', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']
    const { amount } = req.body

    /* Step 1: Insert Order */
    const result = await pool.query(
      `INSERT INTO orders(user_id, amount, status)
       VALUES($1,$2,$3)
       RETURNING *`,
      [userId, amount, 'PENDING']
    )

    const order = result.rows[0]

    /* Step 2: Payment via Circuit Breaker */
    const paymentResponse = await breaker.fire({
      orderId: order.id,
      amount
    })

    /* Step 3: Update Status ONLY if success */
    if (paymentResponse.status !== 'PENDING') {
      await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [
        'PAID',
        order.id
      ])
    }

    /* Step 4: Kafka Event */
    try {
      await producer.send({
        topic: 'order-events',
        messages: [
          {
            value: JSON.stringify({
              event: 'ORDER_CREATED',
              orderId: order.id,
              userId,
              amount
            })
          }
        ]
      })
    } catch {
      console.log('Kafka send failed')
    }

    res.status(201).json({
      message: 'Order created successfully',
      orderId: order.id,
      payment: paymentResponse
    })
  } catch (err) {
    errorCount++
    console.error(err)
    res.status(500).json({
      error: 'Order creation failed'
    })
  }
})

/* MY ORDERS */

app.get('/my-orders', async (req, res) => {
  try {
    const userId = req.headers['x-user-id']

    const result = await pool.query(
      'SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC',
      [userId]
    )

    res.json(result.rows)
  } catch {
    res.status(500).json({
      error: 'Failed to fetch orders'
    })
  }
})

app.get('/stress', (req, res) => {
  const end = Date.now() + 15000

  while (Date.now() < end) {
    Math.sqrt(Math.random())
  }

  res.send('CPU stress completed')
})

/* METRICS */

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.client.register.contentType)

  res.end(await metrics.client.register.metrics())
})

/* SERVER */

const PORT = process.env.ORDER_PORT || 4003
app.get('/stats', (req, res) => {
  res.json({
    requestCount,
    errorCount
  })
})

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`)
})