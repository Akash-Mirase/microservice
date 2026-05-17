const axios = require('axios')
const axiosRetry = require('axios-retry')

axiosRetry(axios, {
  retries: 3
})

module.exports = axios