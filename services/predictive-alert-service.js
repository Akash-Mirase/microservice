/**
 * services/predictive-alert-service.js
 *
 * Step 4: Predictive Alerting
 *
 * Instead of reacting to problems:
 * - Forecast metric trends using linear regression
 * - Alert when trajectory points to failure in next 5 minutes
 * - Pro-active healing before user impact
 *
 * Examples:
 *  "Memory at 65% now, growing 2% per minute → will hit 100% in ~18 min"
 *  "Response time at 150ms, degrading 5ms per minute → will exceed SLA in ~10 min"
 *  "Error rate climbing 0.1/min, if trend continues → ~1% errors in 5 min"
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

const SLA_TARGETS = {
  'response_time': 500,      // ms
  'error_rate':    2.0,      // errors/min
  'cpu':           85,       // %
  'memory':        90        // %
}

const alerts = {}  // { [serviceName]: { triggered: bool, message: str, timestamp: ms } }

/* ─────────────────────────────────────────────────
   LINEAR REGRESSION — predict trends
───────────────────────────────────────────── */

function linearRegression (points) {
  if (points.length < 2) return { slope: 0, intercept: 0, confidence: 0 }

  const n  = points.length
  const xs = points.map((_, i) => i)
  const ys = points

  const meanX = xs.reduce((a, b) => a + b) / n
  const meanY = ys.reduce((a, b) => a + b) / n

  const numerator   = xs.reduce((sum, x, i) => sum + (x - meanX) * (ys[i] - meanY), 0)
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0)

  if (denominator === 0) return { slope: 0, intercept: meanY, confidence: 0 }

  const slope     = numerator / denominator
  const intercept = meanY - slope * meanX

  /* R-squared (goodness of fit) */
  const predictions = xs.map(x => intercept + slope * x)
  const ssRes       = ys.reduce((sum, y, i) => sum + (y - predictions[i]) ** 2, 0)
  const ssTot       = ys.reduce((sum, y) => sum + (y - meanY) ** 2, 0)
  const rSquared    = ssTot === 0 ? 1 : 1 - ssRes / ssTot

  return { slope, intercept, confidence: Math.max(0, rSquared) }
}

/* ─────────────────────────────────────────────────
   FORECAST METRIC TRENDS
───────────────────────────────────────────── */

async function forecastService (serviceName) {
  try {
    /* Fetch last 20 metric snapshots */
    const result = await pool.query(
      `SELECT cpu, memory, response_time, error_rate, created_at
       FROM metrics
       WHERE service_name = $1
       ORDER BY created_at ASC
       LIMIT 20`,
      [serviceName]
    )

    if (result.rows.length < 3) return null

    const samples = result.rows
    const now     = Date.now()

    /* Extract metric trends */
    const memoryValues = samples.map(s => s.memory)
    const cpuValues    = samples.map(s => s.cpu)
    const latencyValues = samples.map(s => s.response_time)
    const errorValues  = samples.map(s => s.error_rate)

    const memoryFit = linearRegression(memoryValues)
    const cpuFit    = linearRegression(cpuValues)
    const latencyFit = linearRegression(latencyValues)
    const errorFit  = linearRegression(errorValues)

    const currentMemory  = memoryValues[memoryValues.length - 1]
    const currentCpu     = cpuValues[cpuValues.length - 1]
    const currentLatency = latencyValues[latencyValues.length - 1]
    const currentError   = errorValues[errorValues.length - 1]

    const predictions = []

    /* Forecast memory */
    if (memoryFit.slope > 1 && memoryFit.confidence > 0.5) {  // growing, good fit
      const minutesToTarget = (SLA_TARGETS.memory - currentMemory) / memoryFit.slope
      if (minutesToTarget > 0 && minutesToTarget < 10) {
        predictions.push({
          metric: 'memory',
          current: currentMemory.toFixed(1),
          slope: memoryFit.slope.toFixed(2),
          minutesToSLA: minutesToTarget.toFixed(1),
          forecast: currentMemory + memoryFit.slope * 5,
          riskLevel: 'CRITICAL'
        })
      }
    }

    /* Forecast CPU */
    if (cpuFit.slope > 1 && cpuFit.confidence > 0.5) {
      const minutesToTarget = (SLA_TARGETS.cpu - currentCpu) / cpuFit.slope
      if (minutesToTarget > 0 && minutesToTarget < 10) {
        predictions.push({
          metric: 'cpu',
          current: currentCpu.toFixed(1),
          slope: cpuFit.slope.toFixed(2),
          minutesToSLA: minutesToTarget.toFixed(1),
          forecast: currentCpu + cpuFit.slope * 5,
          riskLevel: 'CRITICAL'
        })
      }
    }

    /* Forecast latency */
    if (latencyFit.slope > 10 && latencyFit.confidence > 0.5) {  // degrading 10ms+ per sample
      const minutesToTarget = (SLA_TARGETS.response_time - currentLatency) / latencyFit.slope
      if (minutesToTarget > 0 && minutesToTarget < 10) {
        predictions.push({
          metric: 'response_time',
          current: currentLatency.toFixed(0),
          slope: latencyFit.slope.toFixed(1),
          minutesToSLA: minutesToTarget.toFixed(1),
          forecast: (currentLatency + latencyFit.slope * 5).toFixed(0),
          riskLevel: 'HIGH'
        })
      }
    }

    /* Forecast error rate */
    if (errorFit.slope > 0.05 && errorFit.confidence > 0.5) {  // rising 0.05+ per sample
      const minutesToTarget = (SLA_TARGETS.error_rate - currentError) / errorFit.slope
      if (minutesToTarget > 0 && minutesToTarget < 10) {
        predictions.push({
          metric: 'error_rate',
          current: currentError.toFixed(2),
          slope: errorFit.slope.toFixed(3),
          minutesToSLA: minutesToTarget.toFixed(1),
          forecast: (currentError + errorFit.slope * 5).toFixed(2),
          riskLevel: 'HIGH'
        })
      }
    }

    return predictions.length > 0 ? predictions : null
  } catch (err) {
    console.error(`[predictive] forecast error for ${serviceName}:`, err.message)
    return null
  }
}

/* ─────────────────────────────────────────────────
   ALERTING ENGINE
───────────────────────────────────────────── */

async function runPredictiveAlerts () {
  try {
    for (const serviceName of SERVICES) {
      const forecast = await forecastService(serviceName)

      if (forecast && forecast.length > 0) {
        const riskLevel = forecast[0].riskLevel
        const metrics   = forecast.map(f => `${f.metric}: ${f.current}% → ${f.forecast}% in ${f.minutesToSLA}min`).join(', ')

        const message = `${serviceName} trending toward SLA breach: ${metrics}`

        /* Check if already alerted */
        const alreadyAlerted = alerts[serviceName]
        if (alreadyAlerted && Date.now() - alreadyAlerted.timestamp < 300000) {
          continue  // already alerted in last 5 min
        }

        alerts[serviceName] = { triggered: true, message, timestamp: Date.now() }

        /* Log alert */
        await pool.query(
          `INSERT INTO predictive_alerts (service_name, risk_level, metric_forecast, ttl_minutes)
           VALUES ($1, $2, $3, $4)`,
          [serviceName, riskLevel, JSON.stringify(forecast), forecast[0].minutesToSLA]
        )

        console.log(`[predictive] ⚠️  ALERT: ${message}`)

        /* Optionally notify */
        try {
          await axios.post('http://notification-service:4005/send', {
            type: 'PREDICTIVE_ALERT',
            service: serviceName,
            message,
            forecast
          }, { timeout: 2000 })
        } catch {
          // notification service may be down
        }
      } else {
        delete alerts[serviceName]
      }
    }
  } catch (err) {
    console.error('[predictive] error:', err.message)
  }
}

/* ─────────────────────────────────────────────────
   ENDPOINTS
───────────────────────────────────────────── */

app.get('/health', (req, res) => {
  res.json({ service: 'predictive-alert-service', status: 'UP' })
})

/* Get current predictions for a service */
app.get('/forecast/:service', async (req, res) => {
  const forecast = await forecastService(req.params.service)
  res.json(forecast || { message: 'No concerning trends detected' })
})

/* Get all active alerts */
app.get('/alerts', (req, res) => {
  const activeAlerts = Object.entries(alerts)
    .filter(([_, alert]) => Date.now() - alert.timestamp < 300000)
    .map(([service, alert]) => ({ service, ...alert }))
  res.json(activeAlerts)
})

/* Alert history */
app.get('/alert-history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50'), 200)
    const result = await pool.query(
      `SELECT * FROM predictive_alerts ORDER BY created_at DESC LIMIT $1`,
      [limit]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ─────────────────────────────────────────────────
   BOOT
───────────────────────────────────────────── */

async function predictiveAlertLoop () {
  console.log('[predictive] Starting predictive alerting engine...')
  while (true) {
    await runPredictiveAlerts()
    await new Promise(r => setTimeout(r, 20000))  // run every 20s (frequent for prediction)
  }
}

predictiveAlertLoop()

app.listen(4009, () => {
  console.log('[predictive] Predictive Alert Service running on port 4009')
})