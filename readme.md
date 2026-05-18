# 🚀 AI-Powered Self-Healing Microservices System

An advanced distributed systems project that automatically detects failures, diagnoses anomalies, predicts risks, and performs autonomous recovery actions using AI-powered monitoring and Docker-based self-healing.

---

# 📌 Project Overview

This project simulates a modern cloud-native infrastructure capable of:

- Real-time monitoring
- AI anomaly detection
- Root-cause analysis
- Predictive alerting
- Automatic service recovery
- Live observability dashboard

The system continuously monitors all microservices and automatically heals unhealthy services using Docker container orchestration.

---

# 🏗️ Actual Project Structure

```bash
microservice-main/
│
├── dashboard-ui/
│   ├── public/
│   ├── src/
│   │   ├── Dashboard.jsx
│   │   ├── topology.jsx
│   │   └── App.js
│   ├── Dockerfile
│   └── package.json
│
├── database/
│   └── init.sql
│
├── gateway/
│   └── api-gateway.js
│
├── ml-service/
│   ├── app.py
│   └── Dockerfile.ml
│
├── monitoring/
│   ├── anomaly-rules.json
│   ├── prometheus.yml
│   └── promtail-config.yml
│
├── services/
│   ├── auth-service.js
│   ├── order-service.js
│   ├── payment-service.js
│   ├── notification-service.js
│   ├── monitoring-service.js
│   ├── diagnosis-service.js
│   ├── healing-service.js
│   ├── predictive-alert-service.js
│   ├── correlation-engine.js
│   └── traffic-generator.js
│
├── shared/
│   ├── db.js
│   ├── kafka.js
│   ├── logger.js
│   ├── metrics.js
│   ├── redis.js
│   ├── http-client.js
│   └── circuit-breaker.js
│
├── Dockerfile
├── docker-compose.yml
├── package.json
├── requirements.txt
└── readme.md
```

---

# ⚡ Core Features

## 🔍 Real-Time Monitoring

The monitoring engine continuously tracks:

- CPU usage
- Memory usage
- Response time
- Error rates
- Request counts
- Service health

---

## 🤖 AI/ML-Based Anomaly Detection

The ML service analyzes system metrics and predicts:

- CPU spikes
- Memory leaks
- Resource exhaustion
- High latency
- Cascade failures

---

## 🩺 Autonomous Self-Healing

When a service becomes unhealthy:

1. Failure is detected
2. Diagnosis engine analyzes root cause
3. Healing engine triggers recovery
4. Docker container restarts automatically
5. System verifies service restoration

---

## 📊 Live Monitoring Dashboard

The React dashboard provides:

- Real-time service status
- CPU & memory graphs
- Response-time analytics
- Healing history
- Incident tracking
- Predictive alerts
- System topology visualization

---

## 🔄 WebSocket Real-Time Updates

Socket.IO enables:

- Live metrics streaming
- Instant alert updates
- Real-time incident feeds
- Dynamic dashboard refresh

---

# 🛠️ Technology Stack

## Frontend

- React.js
- Recharts
- Socket.IO Client
- Axios
- React Flow

---

## Backend

- Node.js
- Express.js
- Socket.IO
- Dockerode

---

## Database

- PostgreSQL

---

## AI / Machine Learning

- Python
- Flask
- Scikit-learn
- Pandas
- NumPy

---

## DevOps & Monitoring

- Docker
- Docker Compose
- Prometheus
- Grafana
- Redis
- Kafka

---

# 🧠 System Architecture

```text
Dashboard UI
      ↓
Monitoring Service
      ↓
Diagnosis Engine
      ↓
Healing Engine
      ↓
Docker Restart System
      ↓
Microservice Recovery
```

---

# 🔧 Shared Infrastructure

The `shared/` folder provides reusable infrastructure modules.

| File | Purpose |
|---|---|
| db.js | PostgreSQL connection |
| kafka.js | Kafka integration |
| logger.js | Centralized logging |
| metrics.js | Metrics utilities |
| redis.js | Redis caching |
| circuit-breaker.js | Fault tolerance |
| http-client.js | Shared HTTP utilities |

---

# 🚀 Installation & Setup

# 1️⃣ Clone Repository

```bash
git clone https://github.com/your-username/microservice-main.git

cd microservice-main
```

---

# 2️⃣ Install Dependencies

## Root Project

```bash
npm install
```

---

## Dashboard UI

```bash
cd dashboard-ui
npm install
```

---

## Python ML Service

```bash
pip install -r requirements.txt
```

---

# 3️⃣ Configure Environment Variables

Create `.env` files where required.

Example:

```env
DB_HOST=postgres
DB_PORT=5432
DB_USER=admin
DB_PASS=admin123
DB_NAME=self_healing

JWT_SECRET=mySecretKey

REDIS_URL=redis://redis:6379
```

---

# 4️⃣ Start Docker Containers

```bash
docker compose up --build
```

---

# 🌐 Service URLs

| Service | URL |
|---|---|
| Dashboard UI | http://localhost:3000 |
| API Gateway | http://localhost:4000 |
| Monitoring Service | http://localhost:4006 |
| ML Service | http://localhost:5000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

---

# 📡 WebSocket Configuration

## Backend

```js
const http = require('http')
const server = http.createServer(app)

const { Server } = require('socket.io')

const io = new Server(server, {
  cors: {
    origin: '*'
  }
})

server.listen(4006)
```

---

## Frontend

```js
import { io } from 'socket.io-client'

const socket = io('http://localhost:4006')
```

---

# 🔁 Self-Healing Workflow

```text
Failure Detection
       ↓
Anomaly Diagnosis
       ↓
Root Cause Analysis
       ↓
Healing Trigger
       ↓
Docker Container Restart
       ↓
Health Verification
       ↓
Recovery Completed
```

---

# 📈 Monitoring Metrics

The system collects:

- CPU %
- Memory %
- Response Time
- Error Rate
- Request Count
- Service Availability

Metrics are stored in PostgreSQL and streamed to the dashboard in real time.

---

# 🧠 AI Anomaly Types

The ML engine detects:

- MEMORY_LEAK
- CPU_SPIKE
- HIGH_LATENCY
- RESOURCE_EXHAUSTION
- CASCADE_FAILURE
- NETWORK_FAILURE

---

# 🐳 Docker Commands

## Build Containers

```bash
docker compose build
```

---

## Start Containers

```bash
docker compose up
```

---

## Run in Background

```bash
docker compose up -d
```

---

## Stop Containers

```bash
docker compose down
```

---

## Rebuild Without Cache

```bash
docker compose build --no-cache
```

---

# 🧪 Testing Self-Healing

## Stop a Service

```bash
docker stop self-healing-system-auth-service-1
```

The monitoring engine will:

- Detect failure
- Trigger diagnosis
- Restart container
- Restore service automatically

---

# 📊 Dashboard Modules

## Overview

- Service health
- Uptime
- Active incidents
- Live alerts

---

## Metrics

- CPU charts
- Memory charts
- Response-time analytics
- Error-rate graphs

---

## Topology

- Microservice dependency graph
- Live node status

---

## Diagnoses

- Root-cause analysis
- Severity scoring
- Recovery recommendations

---

## Healing History

- Recovery actions
- Restart history
- Healing timelines

---

## Alerts

- Predictive risk alerts
- Failure notifications

---

## Logs

- Real-time system logs
- Incident tracking logs

---

# 🔐 Fault Tolerance Features

- Circuit breaker implementation
- Restart storm prevention
- Health verification checks
- Failure threshold validation
- Cooldown-based healing

---

# ⚠️ Common Issues & Fixes

## Dashboard Shows OFFLINE

Ensure Socket.IO backend is running correctly.

Check:

```bash
docker compose logs monitoring-service
```

---

## Dashboard Shows 0/0 Services

Verify backend emits service updates:

```js
io.emit('service-update', Object.values(serviceState))
```

---

## Charts Not Loading

Ensure metrics endpoint works:

```bash
http://localhost:4006/dashboard/metrics
```

---

## Docker Restart Not Working

Ensure Docker socket is mounted:

```yml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

---

# 🎯 Future Improvements

- Kubernetes integration
- Auto-scaling
- Distributed tracing
- Advanced AI forecasting
- Chaos engineering
- Multi-cluster monitoring
- SLA prediction engine

---

# 📚 Learning Outcomes

This project demonstrates:

- Distributed Systems
- Microservices Architecture
- Fault Tolerance
- Observability Engineering
- Real-Time Monitoring
- AI in DevOps
- Automated Recovery Systems
- Docker Orchestration

---

# 👨‍💻 Authors

## Akash Mirase
## Atharv Jambhule
## Aryam Mhaiskar
## Shrikant karande

Focused on:

- Software Engineering
- Distributed Systems
- AI Systems
- Cloud Computing
- DevOps & Infrastructure

---

# ⭐ Conclusion

This project demonstrates how modern cloud-native systems achieve:

- High Availability
- Intelligent Monitoring
- Predictive Maintenance
- Automated Recovery
- Real-Time Reliability Engineering

It combines:

```text
Microservices + AI + DevOps + Automation + Observability
```

into a single intelligent self-healing infrastructure platform.

