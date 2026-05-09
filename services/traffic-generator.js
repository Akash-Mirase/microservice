const axios = require('axios')

async function generateTraffic () {
  while (true) {
    try {
      await axios.post('http://order-service:4003/create', {
        item: 'Laptop',
        qty: 1
      })

      console.log('Traffic generated')
    } catch (err) {
      console.log(err.message)
    }

    await new Promise(r => setTimeout(r, 1000))
  }
}

generateTraffic()
