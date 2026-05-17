/**
 * services/diagnosis-service.js
 *
 * Step 2: Diagnosis Layer
 * 
 * Takes raw metrics and anomalies, then CLASSIFIES them.
 * Instead of just "something is wrong", answers "WHAT is wrong":
 *  - Memory Leak    : memory rising, other metrics stable
 *  - CPU Leak       : CPU rising, error rate stable
 *  - Cascade Fail   : error rate spikes, latency spikes (dependency issue)
 *  - Cache Poison   : response time spikes, DB load normal
 *  - Resource Exhaust: all metrics high
 *
 * Runs every 30 seconds, reads last 30 samples per service from monitoring.
 */

'use strict'

require('dotenv').config()

const express = require('express')
const axios   = require('axios')
const cors    = require('cors')
const pool = require('../shared/db')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')



const app = express()
app.use(cors())
app.use(express.json())
app.use(helmet())
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
}))


const SERVICES = [
  'auth-service', 'user-service', 'order-service',
  'payment-service', 'notification-service'
]

/* ─────────────────────────────────────────────────
   ANOMALY CLASSIFIER
───────────────────────────────────────────── */

/**
 * Analyzes the last 30 data points for a service.
 * Returns { type, severity, rootCause, recommendation }
 */
function classifyAnomaly (samples) {
  if (samples.length < 10) return { type: 'INSUFFICIENT_DATA', severity: 0, rootCause: 'Not enough samples' }

  const recent = samples.slice(-15)  // last 15 samples
  const older  = samples.slice(0, 15)  // older 15 samples (baseline)

  /* Calculate trends */
  const avgMemoryOld = avg(older.map(s => s.memory))
  const avgMemoryNew = avg(recent.map(s => s.memory))
  const memoryTrend  = (avgMemoryNew - avgMemoryOld) / Math.max(avgMemoryOld, 0.1)

  const avgCpuOld = avg(older.map(s => s.cpu))
  const avgCpuNew = avg(recent.map(s => s.cpu))
  const cpuTrend  = (avgCpuNew - avgCpuOld) / Math.max(avgCpuOld, 0.1)

  const avgErrorOld = avg(older.map(s => s.error_rate))
  const avgErrorNew = avg(recent.map(s => s.error_rate))
  const errorTrend  = avgErrorNew - avgErrorOld

  const avgLatencyOld = avg(older.map(s => s.response_time))
  const avgLatencyNew = avg(recent.map(s => s.response_time))
  const latencyTrend  = (avgLatencyNew - avgLatencyOld) / Math.max(avgLatencyOld, 100)

  /* ── Classify ── */

  // Memory Leak: memory ↑ 30%+, CPU stable, errors stable
  if (memoryTrend > 0.30 && Math.abs(cpuTrend) < 0.15 && errorTrend < 0.5) {
    return {
      type: 'MEMORY_LEAK',
      severity: Math.min(100, memoryTrend * 200),
      rootCause: `Memory growing ${(memoryTrend * 100).toFixed(1)}% (${avgMemoryOld.toFixed(1)}% → ${avgMemoryNew.toFixed(1)}%)`,
      recommendation: 'Check for unreleased objects, event listeners, or unbounded caches. Consider garbage collection tuning.'
    }
  }

  // CPU Leak: CPU ↑ 30%+, memory stable, errors stable
  if (cpuTrend > 0.30 && Math.abs(memoryTrend) < 0.15 && errorTrend < 0.5) {
    return {
      type: 'CPU_LEAK',
      severity: Math.min(100, cpuTrend * 200),
      rootCause: `CPU growing ${(cpuTrend * 100).toFixed(1)}% (${avgCpuOld.toFixed(1)}% → ${avgCpuNew.toFixed(1)}%)`,
      recommendation: 'Likely infinite loop or CPU-bound operation. Check for synchronous heavy computation in hot paths.'
    }
  }

  // Cascade Failure: error ↑ + latency ↑, CPU/memory stable
  if (errorTrend > 1 && latencyTrend > 0.30 && Math.abs(memoryTrend) < 0.15 && Math.abs(cpuTrend) < 0.15) {
    return {
      type: 'CASCADE_FAILURE',
      severity: Math.min(100, Math.abs(errorTrend) * 50 + Math.abs(latencyTrend) * 100),
      rootCause: `Error rate +${errorTrend.toFixed(1)}/min, latency +${(latencyTrend * 100).toFixed(1)}% (likely dependency timeout)`,
      recommendation: 'Check downstream service health (payment, notification, DB). Use circuit breaker to fail fast.'
    }
  }

  // Cache Poison: latency ↑ without CPU/memory increase
  if (latencyTrend > 0.40 && Math.abs(cpuTrend) < 0.15 && Math.abs(memoryTrend) < 0.15 && errorTrend < 0.5) {
    return {
      type: 'CACHE_POISON',
      severity: Math.min(100, latencyTrend * 150),
      rootCause: `Response time +${(latencyTrend * 100).toFixed(1)}% (${avgLatencyOld.toFixed(0)}ms → ${avgLatencyNew.toFixed(0)}ms) without resource increase`,
      recommendation: 'Clear Redis cache or check for hot data that\'s stale. Verify DB query performance.'
    }
  }

  // Resource Exhaustion: all metrics high
  if (memoryTrend > 0.20 && cpuTrend > 0.20 && errorTrend > 0.5) {
    return {
      type: 'RESOURCE_EXHAUSTION',
      severity: Math.min(100, (Math.abs(memoryTrend) + Math.abs(cpuTrend)) * 100),
      rootCause: `Memory ↑${(memoryTrend * 100).toFixed(1)}%, CPU ↑${(cpuTrend * 100).toFixed(1)}%, errors +${errorTrend.toFixed(1)}/min`,
      recommendation: 'Scale horizontally (add replicas) or check for bulk processing that\'s not being rate-limited.'
    }
  }

  // Default: something's wrong but pattern unclear
  return {
    type: 'UNKNOWN_ANOMALY',
    severity: 30,
    rootCause: `Metrics shifting: memory ${(memoryTrend * 100).toFixed(1)}%, CPU ${(cpuTrend * 100).toFixed(1)}%, errors +${errorTrend.toFixed(1)}/min`,
    recommendation: 'Check application logs and recent deployments. May need manual investigation.'
  }
}

function avg (values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

/* ─────────────────────────────────────────────────
   DIAGNOSIS ENGINE
───────────────────────────────────────────── */

async function runDiagnosis () {
  try {
    for (const serviceName of SERVICES) {
      /* Fetch last 30 metrics */
      const result = await pool.query(
        `SELECT cpu, memory, response_time, error_rate
         FROM metrics
         WHERE service_name = $1
         ORDER BY created_at DESC
         LIMIT 30`,
        [serviceName]
      )

      if (result.rows.length < 5) continue

      const samples = result.rows.reverse()  // oldest → newest
      const diagnosis = classifyAnomaly(samples)

      /* Save diagnosis to DB */
      await pool.query(
        `INSERT INTO diagnoses (service_name, anomaly_type, severity, root_cause, recommendation, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (service_name) DO UPDATE SET
           anomaly_type = EXCLUDED.anomaly_type,
           severity = EXCLUDED.severity,
           root_cause = EXCLUDED.root_cause,
           recommendation = EXCLUDED.recommendation,
           created_at = NOW()`,
        [serviceName, diagnosis.type, diagnosis.severity, diagnosis.rootCause, diagnosis.recommendation]
      )

      if (diagnosis.severity > 0) {
        console.log(`[diagnosis] ${serviceName}: ${diagnosis.type} (${diagnosis.severity.toFixed(0)}%) - ${diagnosis.rootCause}`)
      }
    }
  } catch (err) {
    console.error('[diagnosis] error:', err.message)
  }
}
function classifyIncident (metrics) {
  if (metrics.cpu > 90) {
    return 'CPU_SPIKE'
  }

  if (metrics.memory > 90) {
    return 'MEMORY_LEAK'
  }

  if (metrics.errorRate > 50) {
    return 'CASCADE_FAILURE'
  }

  return 'UNKNOWN'
}


/* ─────────────────────────────────────────────────
   ENDPOINTS
───────────────────────────────────────────── */

app.get('/health', (req, res) => {
  res.json({ service: 'diagnosis-service', status: 'UP' })
})

/* Get latest diagnosis for a service */
app.get('/diagnose/:service', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM diagnoses WHERE service_name = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.service]
    )
    res.json(result.rows[0] || { message: 'No diagnosis yet' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* Get all recent diagnoses */
app.get('/diagnoses', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT ON (service_name) * FROM diagnoses ORDER BY service_name, created_at DESC`
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ─────────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */

async function diagnosisLoop () {
  console.log('[diagnosis] Starting diagnosis engine...')
  while (true) {
    await runDiagnosis()
    await new Promise(r => setTimeout(r, 30000))  // run every 30s
  }
}

diagnosisLoop()

app.listen(4007, () => {
  console.log('[diagnosis] Diagnosis Service running on port 4007')
})

module.exports = {
  classifyIncident
}