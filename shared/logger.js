const { Pool } = require('pg')

let loggerPool = null

function getPool () {
  if (!loggerPool) {
    loggerPool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'admin',
      password: process.env.DB_PASS || 'admin123',
      database: process.env.DB_NAME || 'self_healing',
      max: 3,
      idleTimeoutMillis: 10000
    })
  }

  return loggerPool
}

const errorCounters = {}

function getErrorCounter (serviceName) {
  if (!errorCounters[serviceName]) {
    errorCounters[serviceName] = {
      count: 0,
      windowStart: Date.now()
    }
  }

  return errorCounters[serviceName]
}

function getErrorRate (serviceName) {
  const counter = errorCounters[serviceName]

  if (!counter) return 0

  const elapsedMinutes =
    (Date.now() - counter.windowStart) / 60000

  if (elapsedMinutes < 0.01) return 0

  const rate = counter.count / elapsedMinutes

  if (elapsedMinutes > 5) {
    counter.count = 0
    counter.windowStart = Date.now()
  }

  return Math.round(rate * 10) / 10
}

async function writeLog (
  serviceName,
  level,
  message,
  context = {}
) {
  const ts = new Date().toISOString()

  const ctx =
    Object.keys(context).length
      ? JSON.stringify(context)
      : ''

  console.log(
    `[${ts}] [${level}] [${serviceName}] ${message} ${ctx}`
  )

  if (level === 'ERROR') {
    const counter = getErrorCounter(serviceName)

    counter.count++
  }

  try {
    await getPool().query(
      `
      INSERT INTO logs
      (service_name, level, message, context)
      VALUES ($1, $2, $3, $4)
      `,
      [
        serviceName,
        level,
        message,
        JSON.stringify(context)
      ]
    )
  } catch (err) {
    console.error(
      `[LOGGER ERROR] ${err.message}`
    )
  }
}

function createLogger (serviceName) {
  return {
    info: (msg, ctx) =>
      writeLog(serviceName, 'INFO', msg, ctx),

    warn: (msg, ctx) =>
      writeLog(serviceName, 'WARN', msg, ctx),

    error: (msg, ctx) =>
      writeLog(serviceName, 'ERROR', msg, ctx),

    getErrorRate: () =>
      getErrorRate(serviceName)
  }
}

createLogger.getErrorRate = getErrorRate

module.exports = createLogger