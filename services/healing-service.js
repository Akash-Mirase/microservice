/**
 * services/healing-service.js
 *
 * Step 3: Smart Healing
 *
 * Instead of "restart container" for every problem, pick the right action:
 *  - MEMORY_LEAK         → Restart container (free memory)
 *  - CPU_LEAK            → Restart container (clear CPU loops)
 *  - CASCADE_FAILURE     → Circuit breaker trip + drain traffic (don't restart yet)
 *  - CACHE_POISON        → Clear Redis for that service
 *  - RESOURCE_EXHAUSTION → Scale up replicas
 *
 * Receives diagnosis from diagnosis-service.
 * Coordinates with monitoring-service for actual actions.
 * Tracks healing outcomes to learn what works.
 */

'use strict'

require('dotenv').config()

const express = require('express')
const axios   = require('axios')
const cors    = require('cors')
const { Pool } = require('pg')
const Docker  = require('dockerode')

const app = express()
app.use(cors())
app.use(express.json())

const pool = new Pool({
  host:     process.env.DB_HOST || 'postgres',
  port:     parseInt(process.env.DB_PORT || '5432'),
  user:     process.env.DB_USER || 'admin',
  password: process.env.DB_PASS || 'admin123',
  database: process.env.DB_NAME || 'selfhealing'
})

const docker = new Docker({ socketPath: '/var/run/docker.sock' })

const circuitBreakerState = {}  // { [serviceName]: { open: bool, timestamp: ms } }

/* ─────────────────────────────────────────────────
   HEALING ACTIONS
───────────────────────────────────────────── */

async function healRestartContainer (serviceName) {
  try {
    const containerName = `self-healing-system-${serviceName}-1`
    const container     = docker.getContainer(containerName)
    await container.restart()
    return {
      action: 'RESTART_CONTAINER',
      status: 'SUCCESS',
      message: `Container ${serviceName} restarted`
    }
  } catch (err) {
    return {
      action: 'RESTART_CONTAINER',
      status: 'FAILED',
      message: err.message
    }
  }
}

async function healClearCache (serviceName) {
  try {
    /* Try to call the service's /cache/clear endpoint if it exists */
    await axios.post(`http://${serviceName}:${getPort(serviceName)}/cache/clear`, {}, { timeout: 3000 })
    return {
      action: 'CLEAR_CACHE',
      status: 'SUCCESS',
      message: `Cache cleared for ${serviceName}`
    }
  } catch (err) {
    return {
      action: 'CLEAR_CACHE',
      status: 'FAILED',
      message: `Service may not have /cache/clear endpoint: ${err.message}`
    }
  }
}

async function healCircuitBreakerTrip (serviceName) {
  circuitBreakerState[serviceName] = {
    open: true,
    timestamp: Date.now()
  }
  return {
    action: 'CIRCUIT_BREAKER_TRIP',
    status: 'SUCCESS',
    message: `Circuit breaker open for ${serviceName} — failing fast instead of cascading`
  }
}

async function healScaleReplicas (serviceName) {
  return {
    action: 'SCALE_REPLICAS',
    status: 'PENDING',
    message: `Scale replicas for ${serviceName} (requires Kubernetes or Docker Swarm)`
  }
}

async function healGracefulDrain (serviceName) {
  try {
    /* Call service's /drain endpoint to stop accepting NEW requests */
    await axios.post(`http://${serviceName}:${getPort(serviceName)}/drain`, {}, { timeout: 2000 })
    return {
      action: 'GRACEFUL_DRAIN',
      status: 'SUCCESS',
      message: `Graceful drain initiated — in-flight requests allowed to finish`
    }
  } catch (err) {
    return {
      action: 'GRACEFUL_DRAIN',
      status: 'FAILED',
      message: `Service may not support graceful drain: ${err.message}`
    }
  }
}

function getPort (serviceName) {
  const ports = {
    'auth-service':         4001,
    'user-service':         4002,
    'order-service':        4003,
    'payment-service':      4004,
    'notification-service': 4005
  }
  return ports[serviceName] || 4000
}

/* ─────────────────────────────────────────────────
   HEALING DECISION ENGINE
───────────────────────────────────────────── */

async function healBasedOnDiagnosis (serviceName, diagnosis) {
  const actions = []

  if (!diagnosis) {
    return { message: 'No diagnosis available', actions: [] }
  }

  const { anomaly_type, severity } = diagnosis

  if (severity < 30) {
    return { message: 'Severity too low for automatic healing', actions: [] }
  }

  /* Smart healing based on anomaly type */
  switch (anomaly_type) {
    case 'MEMORY_LEAK':
      if (severity > 70) {
        actions.push(await healRestartContainer(serviceName))
      }
      break

    case 'CPU_LEAK':
      if (severity > 70) {
        actions.push(await healRestartContainer(serviceName))
      }
      break

    case 'CASCADE_FAILURE':
      actions.push(await healCircuitBreakerTrip(serviceName))
      actions.push(await healGracefulDrain(serviceName))
      // Don't restart — let the downstream service recover
      break

    case 'CACHE_POISON':
      actions.push(await healClearCache(serviceName))
      break

    case 'RESOURCE_EXHAUSTION':
      if (severity > 80) {
        actions.push(await healScaleReplicas(serviceName))
      }
      break

    default:
      if (severity > 75) {
        actions.push(await healRestartContainer(serviceName))
      }
  }

  return {
    anomaly_type,
    severity: severity.toFixed(1),
    actions
  }
}

/* ─────────────────────────────────────────────────
   HEALING LOOP (triggered by monitoring or manual)
───────────────────────────────────────────── */

async function runSmartHealing () {
  try {
    const services = ['auth-service', 'user-service', 'order-service', 'payment-service', 'notification-service']

    for (const serviceName of services) {
      /* Fetch latest diagnosis */
      const diagResult = await pool.query(
        `SELECT * FROM diagnoses WHERE service_name = $1 ORDER BY created_at DESC LIMIT 1`,
        [serviceName]
      )

      const diagnosis = diagResult.rows[0]
      if (!diagnosis) continue

      /* Only heal if severity is high enough and we haven't healed recently */
      const lastHealing = await pool.query(
        `SELECT created_at FROM healing_actions WHERE service_name = $1 ORDER BY created_at DESC LIMIT 1`,
        [serviceName]
      )

      const timeSinceLastHealing = lastHealing.rows.length
        ? (Date.now() - new Date(lastHealing.rows[0].created_at).getTime()) / 1000
        : Infinity

      if (timeSinceLastHealing < 60) {
        continue  // Don't heal again within 60 seconds
      }

      if (diagnosis.severity < 30) continue

      /* Execute healing */
      const healing = await healBasedOnDiagnosis(serviceName, diagnosis)

      /* Log healing actions */
      for (const action of healing.actions) {
        await pool.query(
          `INSERT INTO healing_actions (service_name, anomaly_type, action_type, action_status, message)
           VALUES ($1, $2, $3, $4, $5)`,
          [serviceName, diagnosis.anomaly_type, action.action, action.status, action.message]
        )
      }

      console.log(`[healing] ${serviceName}: ${diagnosis.anomaly_type} → actions: ${healing.actions.map(a => a.action).join(', ')}`)
    }
  } catch (err) {
    console.error('[healing] error:', err.message)
  }
}

/* ─────────────────────────────────────────────────
   ENDPOINTS
───────────────────────────────────────────── */

app.get('/health', (req, res) => {
  res.json({ service: 'healing-service', status: 'UP' })
})

/* Manual heal trigger */
app.post('/heal/:service', async (req, res) => {
  const { service } = req.params
  const diagResult  = await pool.query(
    `SELECT * FROM diagnoses WHERE service_name = $1 ORDER BY created_at DESC LIMIT 1`,
    [service]
  )
  const diagnosis   = diagResult.rows[0]
  const healing     = await healBasedOnDiagnosis(service, diagnosis)

  for (const action of healing.actions) {
    await pool.query(
      `INSERT INTO healing_actions (service_name, anomaly_type, action_type, action_status, message)
       VALUES ($1, $2, $3, $4, $5)`,
      [service, diagnosis?.anomaly_type, action.action, action.status, action.message]
    )
  }

  res.json(healing)
})

/* Healing history */
app.get('/history/:service', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM healing_actions WHERE service_name = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.service]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* Circuit breaker state */
app.get('/circuit-breakers', (req, res) => {
  res.json(circuitBreakerState)
})

/* Reset circuit breaker */
app.post('/circuit-breakers/:service/reset', (req, res) => {
  delete circuitBreakerState[req.params.service]
  res.json({ message: `Circuit breaker reset for ${req.params.service}` })
})

/* ─────────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */

async function healingLoop () {
  console.log('[healing] Starting smart healing engine...')
  while (true) {
    await runSmartHealing()
    await new Promise(r => setTimeout(r, 60000))  // run every 60s
  }
}

healingLoop()

app.listen(4008, () => {
  console.log('[healing] Smart Healing Service running on port 4008')
})