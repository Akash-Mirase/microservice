const express = require('express')
const axios = require('axios')
const nodemailer = require('nodemailer')

const app = express()
app.use(express.json())

/* ---------------- SERVICES TO MONITOR ---------------- */

const services = [
  { name: 'auth-service', url: 'http://auth-service:4001/health' },
  { name: 'user-service', url: 'http://user-service:4002/health' },
  { name: 'order-service', url: 'http://order-service:4003/health' },
  { name: 'payment-service', url: 'http://payment-service:4004/health' },
  {
    name: 'notification-service',
    url: 'http://notification-service:4005/health'
  }
]

/* ---------------- CHECK HEALTH ---------------- */

async function checkServices () {
  for (let service of services) {
    try {
      const res = await axios.get(service.url)
      console.log(`✅ ${service.name} is UP`)
    } catch (err) {
      console.error(`❌ ${service.name} is DOWN`)

      await handleFailure(service.name)
    }
  }
}

/* ---------------- SELF-HEALING ACTION ---------------- */

async function handleFailure (serviceName) {
  await sendAlert(serviceName);
  console.log(`🛠 Attempting to recover ${serviceName}...`)

  try {
    // 🔥 Restart container (Docker command)
    const { exec } = require('child_process')

    exec(`docker restart self-healing-system-${serviceName}-1`, err => {
      if (err) {
        console.error(`❌ Failed to restart ${serviceName}`)
      } else {
        console.log(`🔁 Restarted ${serviceName}`)
      }
    })
  } catch (err) {
    console.error('Recovery failed:', err.message)
  }
}

require("dotenv").config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
}); 

async function sendAlert(serviceName) {
  try {
    await transporter.sendMail({
      from: "sahaydoot@gmail.com",
      to: "akashmirase6@gmail.com",
      subject: `🚨 Service Down: ${serviceName}`,
      text: `${serviceName} is DOWN and was restarted by self-healing system.`
    });

    console.log(`📧 Alert sent for ${serviceName}`);

  } catch (err) {
    console.error("❌ Email failed:", err.message);
  }
}

/* ---------------- RUN EVERY 10 SEC ---------------- */

setInterval(checkServices, 10000)

/* ---------------- SERVER ---------------- */

app.listen(4006, () => {
  console.log('🧠 Monitoring Service running on port 4006')
})
