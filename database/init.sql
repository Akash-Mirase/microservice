-- ─────────────────────────────────────────
--  USERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id        SERIAL PRIMARY KEY,
  name      TEXT,
  email     TEXT UNIQUE,
  password  TEXT
);

-- ─────────────────────────────────────────
--  ORDERS
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id         SERIAL PRIMARY KEY,
  user_id    INT,
  amount     NUMERIC,
  status     TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────
--  METRICS  (Step 1)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS metrics (
  id             SERIAL PRIMARY KEY,
  service_name   TEXT        NOT NULL,
  cpu            FLOAT       DEFAULT 0,
  memory         FLOAT       DEFAULT 0,
  response_time  INT         DEFAULT 0,
  error_rate     FLOAT       DEFAULT 0,
  request_count  INT         DEFAULT 0,
  created_at     TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_service_time
  ON metrics (service_name, created_at DESC);

-- ─────────────────────────────────────────
--  LOGS  (Step 1)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
  id           SERIAL PRIMARY KEY,
  service_name TEXT      NOT NULL,
  level        TEXT      NOT NULL DEFAULT 'INFO',
  message      TEXT,
  context      JSONB,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_service_time
  ON logs (service_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_logs_level
  ON logs (level, created_at DESC);

-- ─────────────────────────────────────────
--  INCIDENT LOGS  (Step 1)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incident_logs (
  id           SERIAL PRIMARY KEY,
  service_name TEXT,
  stage        TEXT,
  message      TEXT,
  timestamp    TIMESTAMP DEFAULT NOW()
);

-- ─────────────────────────────────────────
--  DIAGNOSES  (Step 2)
--  one per service, updated continuously
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS diagnoses (
  id              SERIAL PRIMARY KEY,
  service_name    TEXT UNIQUE,
  anomaly_type    TEXT,          -- MEMORY_LEAK, CPU_LEAK, CASCADE_FAILURE, etc.
  severity        FLOAT,         -- 0-100
  root_cause      TEXT,
  recommendation  TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnoses_service
  ON diagnoses (service_name);

-- ─────────────────────────────────────────
--  HEALING ACTIONS  (Step 3)
--  log of all healing actions taken
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS healing_actions (
  id             SERIAL PRIMARY KEY,
  service_name   TEXT,
  anomaly_type   TEXT,          -- what triggered it
  action_type    TEXT,          -- RESTART_CONTAINER, CLEAR_CACHE, CIRCUIT_BREAKER_TRIP, etc.
  action_status  TEXT,          -- SUCCESS, FAILED, PENDING
  message        TEXT,
  created_at     TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_healing_service_time
  ON healing_actions (service_name, created_at DESC);

-- ─────────────────────────────────────────
--  PREDICTIVE ALERTS  (Step 4)
--  forecasted SLA breaches
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predictive_alerts (
  id               SERIAL PRIMARY KEY,
  service_name     TEXT,
  risk_level       TEXT,         -- CRITICAL, HIGH, MEDIUM, LOW
  metric_forecast  JSONB,        -- array of forecasted metrics
  ttl_minutes      FLOAT,        -- time to SLA breach
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_service_time
  ON predictive_alerts (service_name, created_at DESC);