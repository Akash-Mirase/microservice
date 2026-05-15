const express = require('express')
const dotenv = require('dotenv')
const { randomUUID } = require('crypto')
const cors = require('cors')

const logger = require('../shared/logger')('payment-service')
const pool = require('../shared/db')

dotenv.config()

const app = express()

let requestCount = 0
let errorCount = 0

app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
  requestCount++

  next()
})

app.get('/health', (req, res) => {
  res.json({
    service: 'payment-service',
    status: 'UP'
  })
})

/* ---------------- PROCESS PAYMENT ---------------- */

app.post('/pay', async (req, res) => {
  try {
    const { orderId, amount } = req.body

    if (!orderId || !amount) {
      return res.status(400).json({
        error: 'orderId and amount required'
      })
    }

    /* Simulate payment success rate */

    const success = Math.random() > 0.1

    if (!success) {
      return res.status(400).json({
        success: false,
        message: 'Payment failed'
      })
    }

    const transactionId = randomUUID()

    res.status(200).json({
      success: true,
      message: 'Payment successful',
      transactionId,
      orderId,
      amount
    })
  } catch (err) {
    errorCount++
    res.status(500).json({
      error: 'Payment processing failed'
    })
  }
})

/* ---------------- REFUND ---------------- */

app.post('/refund', (req, res) => {
  try {
    const { transactionId } = req.body

    if (!transactionId) {
      return res.status(400).json({
        error: 'transactionId required'
      })
    }

    res.json({
      success: true,
      message: 'Refund initiated',
      transactionId
    })
  } catch {
    logger.error('Payment processing failed', {
      error: err.message
    })
    res.status(500).json({
      error: 'Refund failed'
    })
  }
})

/* ---------------- SERVER ---------------- */

const PORT = process.env.PAYMENT_PORT || 4004
const client = require('prom-client')
client.collectDefaultMetrics({
  prefix: 'payment_service_'
})

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

app.get('/stats', (req, res) => {
  res.json({
    requestCount,

    errorCount
  })
})

app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`)
})
