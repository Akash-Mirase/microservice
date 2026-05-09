const axios = require('axios')

async function generateTraffic () {
  while (true) {
    try {
      await Promise.all([
        axios.post(
          'http://order-service:4003/create',
          {
            amount: Math.floor(Math.random() * 1000)
          },
          {
            headers: {
              'x-user-id': '1'
            }
          }
        ),

        axios.get('http://auth-service:4001/health'),

        axios.get('http://user-service:4002/profile', {
          headers: {
            'x-user-id': '1'
          }
        })
      ])

      console.log('Traffic generated')
    } catch (err) {
      console.log(err.message)
    }

    await new Promise(r => setTimeout(r, 1000))
  }
}

generateTraffic()
