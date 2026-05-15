/**
 * shared/logger.js
 *
 * Structured logger for every microservice.
 * Writes to:
 *   1. stdout  (always — Docker captures this)
 *   2. Postgres logs table (async, non-blocking)
 *
 * Usage:
 *   const logger = require('../shared/logger')('auth-service')
 *   logger.info('User registered', { userId: 42 })
 *   logger.warn('Slow DB query', { duration: 1200 })
 *   logger.error('DB connection failed', { err: err.message })
 */

const { Pool } = require('pg')

/* ── DB pool (lazy — only opens connection when first log is written) ── */
let pool = null

function getPool () {
  if (!pool) {
    pool = new Pool({
      host:     process.env.DB_HOST     || 'postgres',
      port:     parseInt(process.env.DB_PORT || '5432'),
      user:     process.env.DB_USER     || 'admin',
      password: process.env.DB_PASS     || 'admin123',
      database: process.env.DB_NAME     || 'selfhealing',
      max: 3,                // small pool — logging is secondary
      idleTimeoutMillis: 10000
    })
  }
  return pool
}

/* ── per-service error counter (used to calculate error_rate) ── */
const errorCounters = {}

function getErrorCounter (serviceName) {
  if (!errorCounters[serviceName]) {
    errorCounters[serviceName] = { count: 0, windowStart: Date.now() }
  }
  return errorCounters[serviceName]
}

/**
 * Returns errors-per-minute for the service over the last sliding window.
 * Called by monitoring-service when it collects metrics.
 */
function getErrorRate (serviceName) {
  const counter = errorCounters[serviceName]
  if (!counter) return 0
  const elapsedMinutes = (Date.now() - counter.windowStart) / 60000
  if (elapsedMinutes < 0.01) return 0
  const rate = counter.count / elapsedMinutes
  /* reset window every 5 minutes so rate doesn't trend to 0 forever */
  if (elapsedMinutes > 5) {
    counter.count      = 0
    counter.windowStart = Date.now()
  }
  return Math.round(rate * 10) / 10
}

/* ── core write function ── */
async function writeLog (serviceName, level, message, context = {}) {
  /* 1. stdout — always synchronous */
  const ts  = new Date().toISOString()
  const ctx = Object.keys(context).length ? JSON.stringify(context) : ''
  console.log(`[${ts}] [${level}] [${serviceName}] ${message} ${ctx}`.trimEnd())

  /* 2. Track error count */
  if (level === 'ERROR') {
    const counter = getErrorCounter(serviceName)
    counter.count++
  }

  /* 3. Postgres — async, never throws to caller */
  try {
    await getPool().query(
      `INSERT INTO logs (service_name, level, message, context)
       VALUES ($1, $2, $3, $4)`,
      [serviceName, level, message, JSON.stringify(context)]
    )
  } catch (err) {
    /* DB write failure must never crash the service */
    console.error(`[LOGGER] DB write failed: ${err.message}`)
  }
}

/* ── factory — returns a bound logger for one service ── */
function createLogger (serviceName) {
  return {
    info  : (msg, ctx) => writeLog(serviceName, 'INFO',  msg, ctx),
    warn  : (msg, ctx) => writeLog(serviceName, 'WARN',  msg, ctx),
    error : (msg, ctx) => writeLog(serviceName, 'ERROR', msg, ctx),
    getErrorRate: () => getErrorRate(serviceName)
  }
}

/* expose getErrorRate so monitoring-service can query any service name */
createLogger.getErrorRate = getErrorRate

module.exports = createLogger