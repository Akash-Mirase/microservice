const CircuitBreaker = require('opossum')

function createBreaker(fn) {

  return new CircuitBreaker(fn, {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 10000
  })
}

module.exports = createBreaker