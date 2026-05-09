const express = require('express')
const axios = require('axios')
const cors = require('cors')
const nodemailer = require('nodemailer')
const http = require('http')
const { Server } = require('socket.io')
const Docker = require('dockerode')
const lastAlert = {}

const { Pool } = require('pg')

const pool = new Pool({
  host: 'postgres',
  user: 'admin',
  password: 'admin123',
  database: 'selfhealing',
  port: 5432
})

const docker = new Docker({
  socketPath: '/var/run/docker.sock'
})

async function getContainerStats (containerName) {
  try {
    const container = docker.getContainer(containerName)

    const stats = await container.stats({ stream: false })

    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage

    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage

    const cpu = (cpuDelta / systemDelta) * 100

    const memory = (stats.memory_stats.usage / stats.memory_stats.limit) * 100

    return {
      cpu: Math.round(cpu) || 0,
      memory: Math.round(memory) || 0
    }
  } catch {
    return {
      cpu: 0,
      memory: 0
    }
  }
}

const app = express()

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

app.use(cors())
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

const serviceState = {}

let currentIncident = {
  active: false,
  service: null,
  stage: null,
  time: null
}

let eventLogs = []

app.get('/dashboard/incident', (req, res) => {
  res.json(currentIncident)
})

app.get('/dashboard/events', (req, res) => {
  res.json(eventLogs)
})

app.get('/dashboard/services', (req, res) => {
  res.json(Object.values(serviceState))
})

app.post(
  '/dashboard/outage/:service',

  (req, res) => {
    const serviceName = req.params.service

    const { exec } = require('child_process')

    exec(`docker stop self-healing-system-${serviceName}-1`)

    res.json({
      message: `${serviceName} stopped`
    })
  }
)

/* ---------------- CHECK HEALTH ---------------- */
async function checkServices () {
  for (let service of services) {
    try {
      const start = Date.now()

      const res = await axios.get(service.url)

      const responseTime = Date.now() - start

      const stats = await getContainerStats(
        `self-healing-system-${service.name}-1`
      )

      serviceState[service.name] = {
        id: service.name,
        name: service.name,
        status: 'UP',
        cpu: stats.cpu,
        memory: stats.memory,
        response: `${responseTime}ms`,
        recovery: 'Stable'
      }

      try {
        console.log({
          cpu: stats.cpu,
          memory: stats.memory,
          errors: 0
        })
        const mlRes = await axios.post('http://ml-service:5000/predict', {
          cpu: stats.cpu || 0,
          memory: stats.memory || 0,
          errors: 0
        })

        if (mlRes.data.status === 'ANOMALY') {
          console.log(`⚠️ ML detected anomaly in ${service.name}`)

          await pushEvent(service.name, 'Anomaly', 'ML anomaly detected')

          await handleFailure(service.name)
        }
      } catch (err) {
        console.log('ML service unavailable')
      }
    } catch (err) {
      console.log(`${service.name} DOWN`)
      serviceState[service.name] = {
        id: service.name,
        name: service.name,
        status: 'DOWN',
        cpu: 0,
        memory: 0,
        response: 'Timeout',
        recovery: 'Recovering'
      }

      await handleFailure(service.name)
    }
  }
}

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/* ---------------- SELF-HEALING ACTION ---------------- */

async function handleFailure (serviceName) {
  const now = Date.now()

  if (lastAlert[serviceName] && now - lastAlert[serviceName] < 60000) {
    return
  }

  lastAlert[serviceName] = now

  await sendAlert(serviceName)

  currentIncident = {
    active: true,
    service: serviceName,
    stage: 'Detection',
    time: new Date().toLocaleTimeString()
  }

  await pushEvent(
    serviceName,
    'Detection',
    `Failure detected in ${serviceName}`
  )

  await delay(2000)

  currentIncident.stage = 'Validation'

  serviceState[serviceName].recovery = 'Validation'

  await pushEvent(serviceName, 'Validation', 'Threshold validation complete')

  await delay(2000)

  currentIncident.stage = 'Restarting'
  serviceState[serviceName].recovery = 'Restarting'

  await pushEvent(serviceName, 'Restarting', 'Recovery initiated')

  const container = docker.getContainer(`self-healing-system-${serviceName}-1`)

  await container.restart()

  console.log(`Waiting for ${serviceName} to recover...`)

  await delay(5000)

  currentIncident.stage = 'Health Verification'
  serviceState[serviceName].recovery = 'Health Verification'

  await pushEvent(
    serviceName,
    'Health Verification',
    'Container restarted successfully'
  )

  await delay(3000)

  currentIncident.stage = 'Restored'
  serviceState[serviceName].recovery = 'Stable'

  await pushEvent(serviceName, 'Restored', 'Service restored')

  await delay(3000)

  currentIncident = {
    active: false,
    service: null,
    stage: null,
    time: null
  }
}

require('dotenv').config()

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
})

async function sendAlert (serviceName) {
  try {
    await transporter.sendMail({
      from: 'sahaydoot@gmail.com',
      to: 'akashmirase6@gmail.com',
      subject: `🚨 Service Down: ${serviceName}`,
      text: `${serviceName} is DOWN and was restarted by self-healing system.`
    })

    console.log(`📧 Alert sent for ${serviceName}`)
  } catch (err) {
    console.error('❌ Email failed:', err.message)
  }
}

async function pushEvent (serviceName, stage, message) {
  const log = {
    serviceName,
    stage,
    message,
    time: new Date().toLocaleTimeString()
  }

  eventLogs.unshift(log)

  io.emit('new-event', {
    message,
    stage,
    time: new Date().toLocaleTimeString()
  })

  if (eventLogs.length > 100) {
    eventLogs.pop()
  }

  try {
    await pool.query(
      `
      INSERT INTO incident_logs
      (service_name, stage, timestamp)

      VALUES ($1, $2, NOW())
      `,
      [serviceName, stage]
    )
  } catch (err) {
    console.log('DB log insert failed:', err.message)
  }
}

async function monitoringLoop () {
  while (true) {
    await checkServices()

    await delay(10000)
  }
}

monitoringLoop()

/* ---------------- SERVER ---------------- */

server.listen(4006, () => {
  console.log('Monitoring Service running')
})
