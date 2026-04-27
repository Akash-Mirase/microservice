const express = require("express");
const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(express.json());

/* ---------------- SERVICES ---------------- */

const services = [
  {
    name: "auth-service",
    url: "http://auth-service:4001/health"
  },
  {
    name: "user-service",
    url: "http://user-service:4002/health"
  },
  {
    name: "order-service",
    url: "http://order-service:4003/health"
  },
  {
    name: "payment-service",
    url: "http://payment-service:4004/health"
  },
  {
    name: "notification-service",
    url: "http://notification-service:4005/health"
  },
  {
    name: "api-gateway",
    url: "http://api-gateway:4000/health"
  }
];

/* ---------------- HEALTH ---------------- */

app.get("/health", (req, res) => {
  res.json({
    service: "monitoring-service",
    status: "UP"
  });
});

/* ---------------- CHECK ALL SERVICES ---------------- */

app.get("/status", async (req, res) => {
  const results = [];

  for (const service of services) {
    const start = Date.now();

    try {
      await axios.get(service.url, {
        timeout: 3000
      });

      const responseTime = Date.now() - start;

      results.push({
        service: service.name,
        status: "UP",
        responseTime: `${responseTime} ms`
      });

    } catch {
      results.push({
        service: service.name,
        status: "DOWN",
        responseTime: "N/A"
      });
    }
  }

  res.json(results);
});

/* ---------------- SUMMARY ---------------- */

app.get("/summary", async (req, res) => {
  const output = {
    totalServices: services.length,
    up: 0,
    down: 0
  };

  for (const service of services) {
    try {
      await axios.get(service.url, {
        timeout: 3000
      });

      output.up++;

    } catch {
      output.down++;
    }
  }

  res.json(output);
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.MONITOR_PORT || 4006;
const client = require("prom-client");
client.collectDefaultMetrics();

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () => {
  console.log(`Monitoring Service running on port ${PORT}`);
});