const redis = require('redis')

const client = redis.createClient({
  url: 'redis://redis:6379'
})

client.on('connect', () => {
  console.log('Redis Connected')
})

client.on('error', err => {
  console.error('Redis Error:', err)
})

async function connectRedis () {
  if (!client.isOpen) {
    await client.connect()
  }
}

module.exports = {
  client,
  connectRedis
}