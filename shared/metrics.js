const client = require('prom-client')

client.collectDefaultMetrics()

const requestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests'
})

const errorCounter = new client.Counter({
  name: 'http_errors_total',
  help: 'Total HTTP errors'
})

module.exports = {
  client,
  requestCounter,
  errorCounter
}