const { Kafka } = require('kafkajs')

const kafka = new Kafka({
  clientId: 'self-healing-platform',
  brokers: ['kafka:9092'],
  retry: {
    retries: 5
  }
})

const producer = kafka.producer()

async function connectProducer () {
  await producer.connect()
  console.log('Kafka Producer Connected')
}

module.exports = {
  kafka,
  producer,
  connectProducer
}