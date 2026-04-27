# AI-Powered Self-Healing Microservices Platform

An industry-style distributed backend system built using Node.js, Python, Docker, PostgreSQL, JWT Authentication, Monitoring, and Machine Learning.

## Features

* Microservices Architecture
* API Gateway
* JWT Authentication & Authorization
* User Management
* Order Management
* Payment Processing
* Notification Service
* Monitoring Service
* ML-based Anomaly Detection
* Dockerized Deployment
* Automated Testing (Jest + Supertest)
* Prometheus Metrics Ready

## Tech Stack

### Backend

* Node.js
* Express.js
* Python (Flask)

### Database

* PostgreSQL

### DevOps

* Docker
* Docker Compose

### Security

* JWT Authentication
* Helmet
* Rate Limiting
* CORS

### Testing

* Jest
* Supertest

### Monitoring

* Prometheus
* Grafana

## Architecture

```text
Client -> API Gateway (4000)
           |-> Auth Service (4001)
           |-> User Service (4002)
           |-> Order Service (4003)
           |-> Payment Service (4004)
           |-> Notification Service (4005)
           |-> Monitoring Service (4006)
           |-> ML Service (5000)
All services use PostgreSQL where needed.
```

## Services

| Service              | Port | Purpose            |
| -------------------- | ---: | ------------------ |
| API Gateway          | 4000 | Central routing    |
| Auth Service         | 4001 | Register/Login     |
| User Service         | 4002 | Profile management |
| Order Service        | 4003 | Order processing   |
| Payment Service      | 4004 | Payments           |
| Notification Service | 4005 | Alerts             |
| Monitoring Service   | 4006 | Health checks      |
| ML Service           | 5000 | Predictions        |

## Setup

```bash
git clone <repo-url>
cd self-healing-system
docker compose up --build
```

## Testing

```bash
npm test
```

## Future Enhancements

* Apache Kafka
* Kubernetes Deployment
* CI/CD Pipeline
* Redis Cache
* Swagger Docs
* OpenTelemetry Tracing
