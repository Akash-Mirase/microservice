const express = require("express");
const dotenv = require("dotenv");
const axios = require("axios");
const { Pool } = require("pg");
const { Kafka } = require("kafkajs");
const client = require("prom-client");
const CircuitBreaker = require("opossum");

dotenv.config();

const app = express();
app.use(express.json());

client.collectDefaultMetrics();

/* DATABASE */

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

/* KAFKA */

const kafka = new Kafka({
  clientId: "order-service",
  brokers: ["kafka:9092"]
});

const producer = kafka.producer();

async function connectKafka() {
  while (true) {
    try {
      await producer.connect();
      console.log("✅ Kafka Producer Connected");
      break;
    } catch (err) {
      console.log("⏳ Waiting for Kafka...");
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

connectKafka();

/* HEALTH */

app.get("/health", (req, res) => {
  res.json({
    service: "order-service",
    status: "UP"
  });
});

async function paymentCall(data) {
  const res = await axios.post(
    "http://payment-service:4004/pay",
    data
  );
  return res.data;
}

const breaker = new CircuitBreaker(paymentCall, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 5000
});

breaker.fallback(() => {
  return { status: "PENDING", message: "Payment delayed" };
});

/* CREATE ORDER */

app.post("/create", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const { amount } = req.body;

    /* Step 1: Insert Order */
    const result = await pool.query(
      `INSERT INTO orders(user_id, amount, status)
       VALUES($1,$2,$3)
       RETURNING *`,
      [userId, amount, "PENDING"]
    );

    const order = result.rows[0];

    /* Step 2: Payment via Circuit Breaker */
    const paymentResponse = await breaker.fire({
      orderId: order.id,
      amount
    });

    /* Step 3: Update Status ONLY if success */
    if (paymentResponse.status !== "PENDING") {
      await pool.query(
        "UPDATE orders SET status=$1 WHERE id=$2",
        ["PAID", order.id]
      );
    }

    /* Step 4: Kafka Event */
    try {
      await producer.send({
        topic: "order-events",
        messages: [
          {
            value: JSON.stringify({
              event: "ORDER_CREATED",
              orderId: order.id,
              userId,
              amount
            })
          }
        ]
      });
    } catch {
      console.log("Kafka send failed");
    }

    res.status(201).json({
      message: "Order created successfully",
      orderId: order.id,
      payment: paymentResponse
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Order creation failed"
    });
  }
});

/* MY ORDERS */

app.get("/my-orders", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];

    const result = await pool.query(
      "SELECT * FROM orders WHERE user_id=$1 ORDER BY id DESC",
      [userId]
    );

    res.json(result.rows);

  } catch {
    res.status(500).json({
      error: "Failed to fetch orders"
    });
  }
});

/* METRICS */

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

/* SERVER */

const PORT = process.env.ORDER_PORT || 4003;

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});