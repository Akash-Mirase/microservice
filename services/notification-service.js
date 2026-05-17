const express = require('express')
const dotenv = require('dotenv')
const { Kafka } = require('kafkajs')
const cors = require('cors')
const redis = require('redis')

const logger = require('../shared/logger')('notification-service')
const pool = require('../shared/db')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const metrics = require('../shared/metrics')

dotenv.config()

const app = express()

let requestCount = 0
let errorCount = 0

app.use(cors())
app.use(express.json())
app.use(helmet())

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
  })
)

app.use((req, res, next) => {
  requestCount++
  metrics.requestCounter.inc()
  next()
})

/* ---------------- REDIS ---------------- */

const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://redis:6379'
})

redisClient.on('error', err => {
  errorCount++
  console.error('Redis Error:', err.message)
})

/* ---------------- KAFKA ---------------- */

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: ['kafka:9092']
})

const producer = kafka.producer()

const consumer = kafka.consumer({
  groupId: 'notification-group'
})

const dlqConsumer = kafka.consumer({
  groupId: 'dlq-group'
})

const MAX_RETRY = 3

function getDelay (retryCount) {
  return Math.min(1000 * 2 ** retryCount, 30000)
}

/* ---------------- CONSUMER ---------------- */

async function startConsumer () {
  await consumer.connect()

  await consumer.subscribe({
    topic: 'order-events',
    fromBeginning: true
  })

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const data = JSON.parse(message.value.toString())

        console.log('📩 Event:', data)

        if (!data.orderId) {
          throw new Error('Invalid event')
        }

        console.log(`✅ Order processed: ${data.orderId}`)
      } catch (err) {
        errorCount++

        console.error('❌ Processing failed:', err.message)

        let data

        try {
          data = JSON.parse(message.value.toString())
        } catch {
          return
        }

        const retryCount = data.retryCount || 0

        if (retryCount < MAX_RETRY) {
          const nextRetry = retryCount + 1

          setTimeout(async () => {
            await producer.send({
              topic: 'order-events',
              messages: [
                {
                  value: JSON.stringify({
                    ...data,
                    retryCount: nextRetry
                  })
                }
              ]
            })
          }, getDelay(nextRetry))
        } else {
          await producer.send({
            topic: 'order-events-dlq',
            messages: [
              {
                value: JSON.stringify(data)
              }
            ]
          })

          console.log('📦 Sent to DLQ')
        }
      }
    }
  })

  console.log('✅ Kafka Consumer Running')
}

/* ---------------- DLQ ---------------- */

async function startDLQConsumer () {
  await dlqConsumer.connect()

  await dlqConsumer.subscribe({
    topic: 'order-events-dlq',
    fromBeginning: true
  })

  await dlqConsumer.run({
    eachMessage: async ({ message }) => {
      const data = JSON.parse(message.value.toString())

      console.log('🔁 DLQ EVENT:', data)
    }
  })
}

/* ---------------- ROUTES ---------------- */

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')

    res.json({
      service: 'notification-service',
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

app.get('/stats', (req, res) => {
  res.json({
    requestCount,
    errorCount
  })
})

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.client.register.contentType)

  res.end(await metrics.client.register.metrics())
})

/* ---------------- INIT ---------------- */

async function init () {
  try {
    console.log('🚀 Starting Notification Service...')

    await redisClient.connect()
    console.log('✅ Redis Connected')

    await producer.connect()
    console.log('✅ Kafka Producer Connected')

    await startConsumer()

    await startDLQConsumer()

    const PORT = process.env.NOTIFICATION_PORT || 4005

    app.listen(PORT, () => {
      console.log(`✅ Notification Service running on port ${PORT}`)
    })
  } catch (err) {
    errorCount++
    console.error('❌ Init failed:', err.message)
  }
}

init()