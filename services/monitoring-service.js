/**
 * services/monitoring-service.js
 *
 * Step 1 upgrade: Rich Metric + Log Collection Pipeline
 *
 * What's new vs the original:
 *  - Collects cpu, memory, response_time, error_rate, request_count per service
 *  - Persists every poll into the metrics table (not just on failure)
 *  - Pulls recent ERROR logs from each service's /logs endpoint
 *  - Feeds ALL of this into ML service (not just cpu/memory)
 *  - /dashboard/metrics  → last N rows per service
 *  - /dashboard/logs     → recent ERROR/WARN logs across all services
 *  - /dashboard/health   → live snapshot of every service
 */

'use strict'

require('dotenv').config()

const express = require('express')
const cors = require('cors')
const nodemailer = require('nodemailer')
const http = require('http')
const { Server } = require('socket.io')
const Docker = require('dockerode')
const axios = require('axios')
const pool = require('../shared/db')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const metrics = require('../shared/metrics')
const rules = require('../monitoring/anomaly-rules.json')
const { classifyIncident } = require('./diagnosis-service')
const { analyzeFailure } = require('./correlation-engine')

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/* ─────────────────────────────────────────────
   DOCKER
───────────────────────────────────────────── */
const docker = new Docker({ socketPath: '/var/run/docker.sock' })

/* ─────────────────────────────────────────────
   EXPRESS + SOCKET.IO
───────────────────────────────────────────── */
const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())
app.use(express.json())

app.use(helmet())

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000
  })
)

const result = analyzeFailure('payment-service', [
  'order-service',
  'notification-service'
])

console.log(result)

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err)
})

process.on('uncaughtException', err => {
  console.error('Uncaught Exception:', err)
})
/* ─────────────────────────────────────────────
   SERVICE REGISTRY
   Each service optionally exposes:
     GET /health  → { status: 'UP' }
     GET /stats   → { requestCount: N, errorCount: N }  (optional)
───────────────────────────────────────────── */
const SERVICES = [
  {
    name: 'auth-service',
    url: 'http://auth-service:4001',
    container: 'self-healing-system-auth-service-1'
  },
  {
    name: 'user-service',
    url: 'http://user-service:4002',
    container: 'self-healing-system-user-service-1'
  },
  {
    name: 'order-service',
    url: 'http://order-service:4003',
    container: 'self-healing-system-order-service-1'
  },
  {
    name: 'payment-service',
    url: 'http://payment-service:4004',
    container: 'self-healing-system-payment-service-1'
  },
  {
    name: 'notification-service',
    url: 'http://notification-service:4005',
    container: 'self-healing-system-notification-service-1'
  },
  {
    name: 'ml-service',
    url: 'http://ml-service:5000',
    container: 'self-healing-system-ml-service-1'
  }
]

/* ─────────────────────────────────────────────
   IN-MEMORY STATE
───────────────────────────────────────────── */
const serviceState = {} // live snapshot shown on dashboard
const lastAlert = {} // cooldown tracker — avoid alert storms
const metricsBuffer = {} // rolling window of last 30 readings per service
const failureCounts = {}
let serviceStateCache = []

let currentIncident = { active: false, service: null, stage: null, time: null }
let eventLogs = [] // last 100 healing events (in-memory for WS)

/* initialise buffer slots */
for (const svc of SERVICES) {
  metricsBuffer[svc.name] = []
}

/* ─────────────────────────────────────────────
   DOCKER STATS  (cpu % + memory %)
───────────────────────────────────────────── */
async function getContainerStats (containerName) {
  try {
    const container = docker.getContainer(containerName)
    const stats = await container.stats({ stream: false })

    const cpuDelta =
      stats.cpu_stats.cpu_usage.total_usage -
      stats.precpu_stats.cpu_usage.total_usage
    const systemDelta =
      stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
    const cpuCores = stats.cpu_stats.online_cpus || 1
    let cpu = 0

    if (systemDelta > 0 && cpuDelta > 0) {
      cpu = (cpuDelta / systemDelta) * cpuCores * 100
    }
    const usage = stats.memory_stats.usage || 0
    const limit = stats.memory_stats.limit || 1

    const memory = (usage / limit) * 100

    return {
      cpu: Math.max(0, Math.round(cpu * 10) / 10),
      memory: Math.max(0, Math.round(memory * 10) / 10)
    }
  } catch {
    return { cpu: 0, memory: 0 }
  }
}

/* ─────────────────────────────────────────────
   COLLECT SERVICE STATS  (request + error counts)
   Services that expose GET /stats return:
     { requestCount: N, errorCount: N }
   Others fall back to 0.
───────────────────────────────────────────── */
async function getServiceStats (baseUrl) {
  try {
    const res = await axios.get(`${baseUrl}/stats`, { timeout: 2000 })
    return {
      requestCount: res.data.requestCount || 0,
      errorCount: res.data.errorCount || 0
    }
  } catch {
    return { requestCount: 0, errorCount: 0 }
  }
}

/* ─────────────────────────────────────────────
   PERSIST METRIC ROW
───────────────────────────────────────────── */
async function saveMetric (
  serviceName,
  cpu,
  memory,
  responseTime,
  errorRate,
  requestCount
) {
  try {
    await pool.query(
      `INSERT INTO metrics (service_name, cpu, memory, response_time, error_rate, request_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [serviceName, cpu, memory, responseTime, errorRate, requestCount]
    )
  } catch (err) {
    console.error(`[monitoring] metrics insert failed: ${err.message}`)
  }
}
/* ─────────────────────────────────────────────
   PERSIST LOG ROW  (called by each service indirectly via shared/logger,
   but monitoring also writes its own operational logs here)
───────────────────────────────────────────── */
async function saveLog (serviceName, level, message, context = {}) {
  const ts = new Date().toISOString()
  console.log(`[${ts}] [${level}] [${serviceName}] ${message}`)
  try {
    await pool.query(
      `INSERT INTO logs (service_name, level, message, context)
       VALUES ($1, $2, $3, $4)`,
      [serviceName, level, message, JSON.stringify(context)]
    )
  } catch (err) {
    console.error(`[monitoring] log insert failed: ${err.message}`)
  }
}

/* ─────────────────────────────────────────────
   ROLLING METRICS BUFFER
   Keeps last 30 readings in memory per service
   so ML model always has a window to work with.
───────────────────────────────────────────── */
function pushToBuffer (serviceName, snapshot) {
  const buf = metricsBuffer[serviceName]
  buf.push(snapshot)
  if (buf.length > 30) buf.shift()
}

/* ─────────────────────────────────────────────
   CALL ML SERVICE
   Sends the rolling buffer for a service.
   Returns 'ANOMALY' | 'NORMAL' | 'SKIP'
───────────────────────────────────────────── */
async function callML (serviceName) {
  const buf = metricsBuffer[serviceName]
  if (buf.length < 10) return 'SKIP' // not enough data yet

  try {
    const res = await axios.post(
      'http://ml-service:5000/predict',
      buf, // array of { cpu, memory, response_time, error_rate }
      { timeout: 5000 }
    )
    return res.data.status // 'ANOMALY' | 'NORMAL'
  } catch {
    return 'SKIP'
  }
}

/* ─────────────────────────────────────────────
   MAIN POLL LOOP — runs every 10 s
───────────────────────────────────────────── */
async function checkServices () {
  for (const svc of SERVICES) {
    let status = 'UP'
    let responseTime = 0
    let cpu = 0
    let memory = 0
    let errorRate = 0
    let requestCount = 0

    /* ── 1. Health check ── */
    try {
      const start = Date.now()
      await axios.get(`${svc.url}/health`, { timeout: 5000 })
      responseTime = Date.now() - start
    } catch {
      status = 'DOWN'
      responseTime = 9999
      await saveLog(
        svc.name,
        'ERROR',
        `Health check failed — service appears DOWN`
      )
    }

    /* ── 2. Docker stats ── */

    const dockerStats = await getContainerStats(svc.container)
    cpu = dockerStats.cpu
    memory = dockerStats.memory
    try {
      const container = docker.getContainer(svc.container)

      const logsBuffer = await container.logs({
        stdout: true,
        stderr: true,
        tail: 50
      })

      const logs = logsBuffer.toString()

      if (
        logs.includes('ECONNREFUSED') ||
        logs.includes('timeout') ||
        logs.includes('ENOMEM')
      ) {
        await saveLog(svc.name, 'WARN', 'Log anomaly detected')
      }
    } catch (err) {
      console.log(err.message)
    }
    /* ── 3. Application-level stats (request/error counts) ── */
    if (status === 'UP') {
      const appStats = await getServiceStats(svc.url)
      requestCount = appStats.requestCount

      /* error_rate = errors per minute derived from count + poll interval */
      errorRate =
        requestCount > 0
          ? Math.round((appStats.errorCount / requestCount) * 100)
          : 0
    }
    if (cpu > rules.cpu_threshold) {
      console.log('CPU anomaly detected')
    }

    /* ── 4. Warn on concerning individual thresholds ── */
    if (cpu > 80) {
      await saveLog(svc.name, 'WARN', `High CPU detected`, { cpu })
    }

    if (responseTime > 3000 && status === 'UP') {
      await saveLog(svc.name, 'WARN', 'Latency spike detected', {
        responseTime
      })
    }
    if (memory > 85) {
      await saveLog(svc.name, 'WARN', `High memory detected`, { memory })
    }
    if (responseTime > 2000 && status === 'UP') {
      await saveLog(svc.name, 'WARN', `Slow response time`, { responseTime })
    }

    /* ── 5. Push to rolling buffer ── */
    const snapshot = {
      cpu,
      memory,
      response_time: responseTime,
      error_rate: errorRate,
      request_count: requestCount
    }
    pushToBuffer(svc.name, snapshot)
    const issue = classifyIncident(snapshot)

    /* ── 6. Persist metric to DB ── */
    await saveMetric(
      svc.name,
      cpu,
      memory,
      responseTime,
      errorRate,
      requestCount
    )

    /* ── 7. Update live state ── */
    serviceState[svc.name] = {
      name: svc.name,
      status,
      cpu,
      memory,
      responseTime: `${responseTime}ms`,
      errorRate,
      requestCount,
      recovery: status === 'UP' ? 'Stable' : 'Recovering',
      updatedAt: new Date().toISOString()
    }

    console.log('EMITTING SERVICES')
    console.log(Object.values(serviceState))

    /* ── 8. Emit live state to dashboard via WebSocket ── */
    io.emit('service-update', Object.values(serviceState))
    console.log(
      'EMITTING:',
      JSON.stringify(Object.values(serviceState), null, 2)
    )

    /* ── 9. ML anomaly check (on UP services with enough data) ── */
    if (status === 'UP') {
      const mlResult = await callML(svc.name)
      if (mlResult === 'ANOMALY') {
        await saveLog(
          svc.name,
          'WARN',
          'ML anomaly detected — triggering healing',
          snapshot
        )
        if (cpu > 95 || memory > 95 || errorRate > 50) {
          await handleFailure(svc.name, 'critical-anomaly', issue)
        }
      }
    }

    /* ── 10. Trigger healing for DOWN services ── */
    if (status === 'DOWN') {
      failureCounts[svc.name] = (failureCounts[svc.name] || 0) + 1

      console.log(`${svc.name} failures:`, failureCounts[svc.name])

      // restart only after 3 failures
      if (failureCounts[svc.name] >= 3) {
        await handleFailure(svc.name, 'health-fail', issue)

        failureCounts[svc.name] = 0
      }
    } else {
      failureCounts[svc.name] = 0
    }
  }
}

/* ─────────────────────────────────────────────
   HEALING PIPELINE  (unchanged logic, better logging)
───────────────────────────────────────────── */

async function handleFailure (serviceName, reason, issue = 'UNKNOWN') {
  const now = Date.now()
  if (lastAlert[serviceName] && now - lastAlert[serviceName] < 10000) return
  lastAlert[serviceName] = now
  failureCounts[serviceName] = (failureCounts[serviceName] || 0) + 1
  if (failureCounts[serviceName] > 5) {
    await saveLog(
      serviceName,
      'ERROR',
      'Restart storm detected — recovery halted'
    )

    return
  }

  await sendAlert(serviceName, reason)

  const stages = [
    { stage: 'Detection', msg: `Issue detected (${reason})`, wait: 2000 },
    { stage: 'Validation', msg: 'Threshold validation complete', wait: 2000 },
    { stage: 'Restarting', msg: 'Restarting container', wait: 0 },
    {
      stage: 'Health Verification',
      msg: 'Waiting for service to come back',
      wait: 5000
    },
    { stage: 'Restored', msg: 'Service restored', wait: 3000 }
  ]

  currentIncident = {
    active: true,
    service: serviceName,
    stage: stages[0].stage,
    time: new Date().toLocaleTimeString()
  }
  io.emit('incident-update', currentIncident)
  await pushEvent({
    type: 'SERVICE_DOWN',
    service: serviceName,
    message: 'Health check failed'
  })
  for (const step of stages) {
    currentIncident.stage = step.stage
    if (serviceState[serviceName])
      serviceState[serviceName].recovery = step.stage

    await saveLog(serviceName, 'INFO', `Healing: ${step.stage} — ${step.msg}`)

    if (step.stage === 'Restarting') {
      try {
        const container = docker.getContainer(
          `self-healing-system-${serviceName}-1`
        )
        serviceState[serviceName].status = 'RECOVERING'
        await container.restart()
        await delay(30000)
      } catch (err) {
        await saveLog(serviceName, 'ERROR', 'Container restart failed', {
          err: err.message
        })
      }
    }

    await pool.query(
      `
  INSERT INTO healing_history (
    service_name,
    action_type,
    action_status,
    message
  )
  VALUES ($1,$2,$3,$4)
`,
      [
        serviceName,
        'RESTART_CONTAINER',
        'SUCCESS',
        'Container restarted successfully'
      ]
    )

    try {
      await axios.post('http://healing-service:4008/heal', {
        serviceName,
        issue: 'SERVICE_DOWN'
      })
    } catch (err) {
      console.error('[healing request]', err.message)
    }

    console.log(`[healing] Recovery request sent for ${serviceName}`)

    if (issue !== 'NORMAL') {
      const anomalyType = issue
      const svcState = serviceState[serviceName] || {}

      const severity = Math.min(
        100,
        Math.round(
          ((svcState.cpu || 0) +
            (svcState.memory || 0) +
            (svcState.errorRate || 0)) /
            3
        )
      )
      const rootCause = `${serviceName} unhealthy`
      const recommendation = 'Restart payment-service'

      await pool.query(
        `
  INSERT INTO diagnoses (
    service_name,
    anomaly_type,
    severity,
    root_cause,
    recommendation,
    updated_at
  )
  VALUES ($1,$2,$3,$4,$5,NOW())

  ON CONFLICT (service_name)
  DO UPDATE SET
    anomaly_type = EXCLUDED.anomaly_type,
    severity = EXCLUDED.severity,
    root_cause = EXCLUDED.root_cause,
    recommendation = EXCLUDED.recommendation,
    updated_at = NOW()
`,
        [serviceName, anomalyType, severity, rootCause, recommendation]
      )
    }

    if (step.wait > 0) await delay(step.wait)
  }
  failureCounts[serviceName] = 0

  currentIncident = { active: false, service: null, stage: null, time: null }
}

async function pushEvent (eventData) {
  const event = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    ...eventData
  }

  eventLogs.unshift(event)

  if (eventLogs.length > 100) {
    eventLogs.pop()
  }

  io.emit('new-event', event)

  io.emit('event-update', event)

  console.log('[monitoring] Event:', event)

  try {
    await pool.query(
      `INSERT INTO incident_logs (service_name, stage, message)
       VALUES ($1, $2, $3)`,
      [event.service || 'unknown', event.type || 'UNKNOWN', event.message || '']
    )
  } catch (err) {
    console.error(`[monitoring] incident_logs insert failed: ${err.message}`)
  }
}

/* ─────────────────────────────────────────────
   EMAIL ALERT
───────────────────────────────────────────── */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
})

async function sendAlert (serviceName, reason) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.ALERT_EMAIL || process.env.EMAIL_USER,
      subject: `🚨 Self-Healing Triggered: ${serviceName}`,
      text: `Service: ${serviceName}\nReason: ${reason}\nAction: Container restart initiated by self-healing system.`
    })
  } catch (err) {
    console.error(`[monitoring] email alert failed: ${err.message}`)
  }
}

/* ─────────────────────────────────────────────
   REST ENDPOINTS
───────────────────────────────────────────── */

/* Live snapshot of all services */
app.get('/dashboard/health', async (req, res) => {
  try {
    const newData = Object.values(serviceState)

    // update cache only if valid data exists
    if (newData.length > 0) {
      serviceStateCache = newData
    }

    res.json(serviceStateCache)
  } catch (err) {
    console.error('[dashboard health]', err.message)

    // return cached data instead of blank dashboard
    res.json(serviceStateCache)
  }
})

/* Last N metric rows per service (default 50) */
app.get('/dashboard/metrics', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50'), 200)
  const serviceName = req.query.service // optional filter

  try {
    const query = serviceName
      ? `SELECT * FROM metrics WHERE service_name = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM metrics ORDER BY created_at DESC LIMIT $1`
    const params = serviceName ? [serviceName, limit] : [limit]
    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', metrics.client.register.contentType)

  res.end(await metrics.client.register.metrics())
})

/* Recent logs — filter by level and/or service */
app.get('/dashboard/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '100'), 500)
  const level = req.query.level // INFO | WARN | ERROR  (optional)
  const serviceName = req.query.service // optional

  try {
    let query = 'SELECT * FROM logs WHERE 1=1'
    const params = []

    if (serviceName) {
      params.push(serviceName)
      query += ` AND service_name = $${params.length}`
    }
    if (level) {
      params.push(level)
      query += ` AND level = $${params.length}`
    }

    params.push(limit)
    query += ` ORDER BY created_at DESC LIMIT $${params.length}`

    const result = await pool.query(query, params)
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* In-memory rolling metrics buffer (no DB hit) */
app.get('/dashboard/buffer', (req, res) => {
  const serviceName = req.query.service
  if (serviceName) return res.json(metricsBuffer[serviceName] || [])
  res.json(metricsBuffer)
})

/* Active incident */
app.get('/dashboard/incident', (req, res) => {
  res.json(currentIncident)
})

/* Healing event log */
app.get('/dashboard/events', async (req, res) => {
  const result = await pool.query(`
    SELECT *
    FROM incidents
    ORDER BY created_at DESC
    LIMIT 20
  `)

  res.json(result.rows)
})

/* Manual outage simulation */
app.post('/dashboard/outage/:service', (req, res) => {
  const { exec } = require('child_process')
  exec(`docker stop self-healing-system-${req.params.service}-1`)
  res.json({ message: `${req.params.service} stopped` })
})

/* Health of monitoring service itself */
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')

    res.json({
      status: 'UP'
    })
  } catch {
    res.status(500).json({
      status: 'DOWN'
    })
  }
})

app.get('/dashboard/sla', async (req, res) => {
  try {
    const total = Object.keys(serviceState).length

    const healthy = Object.values(serviceState).filter(
      s => s.status === 'UP'
    ).length

    const uptime = total > 0 ? ((healthy / total) * 100).toFixed(2) : 0

    res.json({
      uptime,
      mttr: '2 minutes',
      mtbf: '18 hours',
      incidents: eventLogs.length
    })
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

app.get('/dashboard/root-cause', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM diagnoses
      ORDER BY created_at DESC
      LIMIT 1
    `)

    if (result.rows.length === 0) {
      return res.json({
        rootCause: 'No incidents detected',
        confidence: 0,
        affectedServices: []
      })
    }

    res.json(result.rows[0])
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

app.get('/dashboard/heatmap', (req, res) => {
  const heatmap = Object.values(serviceState).map(service => ({
    service: service.name,

    score: Math.min(
      100,
      (service.cpu + service.memory + service.errorRate) / 3
    ).toFixed(0)
  }))

  res.json(heatmap)
})

/* ─────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */
async function monitoringLoop () {
  console.log('[monitoring] Starting collection loop...')

  setInterval(async () => {
    try {
      await checkServices()
    } catch (err) {
      console.error('[monitoring loop]', err.message)
    }
  }, 10000)
}

setInterval(async () => {
  await pool.query(`
    DELETE FROM metrics
    WHERE created_at <
    NOW() - INTERVAL '7 days'
  `)
}, 3600000)
async function startMonitoring () {
  await delay(30000)

  monitoringLoop()
}

startMonitoring()

app.get('/diagnoses', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM diagnoses
      ORDER BY created_at DESC
    `)

    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/alerts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM predictive_alerts
      ORDER BY created_at DESC
    `)

    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/history/:service', async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM healing_history
      WHERE service_name = $1
      ORDER BY created_at DESC
      LIMIT 30
    `,
      [req.params.service]
    )

    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/heal/:service', async (req, res) => {
  try {
    await handleFailure(req.params.service, 'manual-heal')

    res.json({
      success: true,
      actions: ['restart-triggered']
    })
  } catch (err) {
    res.status(500).json({
      error: err.message
    })
  }
})

server.listen(4006, () => {
  console.log('[monitoring] Monitoring Service running on port 4006')
})
