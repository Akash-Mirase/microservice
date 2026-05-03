const express = require('express')
const dotenv = require('dotenv')
const { Kafka } = require('kafkajs')
const client = require('prom-client')

dotenv.config()

const app = express()
app.use(express.json())

client.collectDefaultMetrics()

/* ---------------- KAFKA ---------------- */

// 1. Create Kafka FIRST
const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: ['kafka:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 10
  }
})

// 2. Create Producer & Consumers
const producer = kafka.producer()

const consumer = kafka.consumer({
  groupId: 'notification-group'
})

const dlqConsumer = kafka.consumer({
  groupId: 'dlq-group'
})

const MAX_RETRY = 3

function getDelay (retryCount) {
  const base = 1000
  const maxDelay = 30000

  let delay = Math.min(base * 2 ** retryCount, maxDelay)

  // jitter
  delay = delay + Math.floor(Math.random() * 1000)

  return delay
}
/* ---------------- MAIN CONSUMER ---------------- */

async function startConsumer () {
  while (true) {
    try {
      console.log('🔄 Connecting to Kafka...')

      await consumer.connect()

      await consumer.subscribe({
        topic: 'order-events',
        fromBeginning: true
      })

      await consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const data = JSON.parse(message.value.toString())

            console.log('📩 Processing:', data)

            // Simulate failure condition
            if (!data.orderId) {
              throw new Error('Invalid event')
            }

            console.log(`✅ Order processed: ${data.orderId}`)
          } catch (err) {
            console.error('❌ Processing failed:', err.message)

            let data

            try {
              data = JSON.parse(message.value.toString())
            } catch {
              console.error('❌ Invalid message format')
              return
            }

            const retryCount = data.retryCount || 0

            if (retryCount < MAX_RETRY) {
              const newRetry = retryCount + 1
              const delay = getDelay(newRetry)

              console.log(`🔁 Retry ${newRetry} scheduled after ${delay} ms`)

              setTimeout(async () => {
                await producer.send({
                  topic: 'order-events',
                  messages: [
                    {
                      value: JSON.stringify({
                        ...data,
                        retryCount: newRetry,
                        lastRetryAt: Date.now()
                      })
                    }
                  ]
                })

                console.log(`🔁 Retry ${newRetry} sent`)
              }, delay)
            } else {
              // FINAL → DLQ
              await producer.send({
                topic: 'order-events-dlq',
                messages: [
                  {
                    value: JSON.stringify(data)
                  }
                ]
              })

              console.log('📦 Sent to DLQ after max retries')
            }
          }
        }
      })

      console.log('✅ Kafka Consumer Connected')
      break
    } catch (err) {
      console.error('❌ Kafka not ready:', err.message)
      await new Promise(r => setTimeout(r, 5000))
    }
  }
}

/* ---------------- DLQ CONSUMER ---------------- */

async function startDLQConsumer () {
  await dlqConsumer.connect()

  await dlqConsumer.subscribe({
    topic: 'order-events-dlq',
    fromBeginning: true
  })

  await dlqConsumer.run({
    eachMessage: async ({ message }) => {
      try {
        const data = JSON.parse(message.value.toString())

        console.log('🔁 RETRYING DLQ EVENT:', data)

        // You can add retry logic here
      } catch (err) {
        console.error('❌ Invalid DLQ message')
      }
    }
  })
}

/* ---------------- INIT ---------------- */

async function init () {
  try {
    console.log('🚀 Starting Notification Service...')

    await producer.connect()
    console.log('✅ Producer Connected')

    await startConsumer()
    await startDLQConsumer()
  } catch (err) {
    console.error('❌ Init failed:', err)
  }
}

init()

/* ---------------- CRASH HANDLER ---------------- */

consumer.on(consumer.events.CRASH, async event => {
  console.error('🔥 Consumer crashed:', event.payload.error)
  console.log('🔁 Restarting consumer...')
  await startConsumer()
})

/* ---------------- HEALTH ---------------- */

app.get('/health', (req, res) => {
  res.json({
    service: 'notification-service',
    status: 'UP'
  })
})

/* ---------------- METRICS ---------------- */

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

/* ---------------- SERVER ---------------- */

const PORT = process.env.NOTIFICATION_PORT || 4005

app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`)
})
