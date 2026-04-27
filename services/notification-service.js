const express = require("express");
const dotenv = require("dotenv");
const { Kafka } = require("kafkajs");
const client = require("prom-client");

dotenv.config();

const app = express();
app.use(express.json());

client.collectDefaultMetrics();

/* ---------------- KAFKA ---------------- */

const kafka = new Kafka({
  clientId: "notification-service",
  brokers: ["kafka:9092"]
});

const consumer = kafka.consumer({
  groupId: "notification-group"
});

async function connectKafka() {
  while (true) {
    try {
      await consumer.connect();

      await consumer.subscribe({
        topic: "order-events",
        fromBeginning: true
      });

      await consumer.run({
        eachMessage: async ({ message }) => {
          const data = JSON.parse(
            message.value.toString()
          );

          console.log("📩 Notification Event:", data);

          console.log(
            `Order confirmation sent for Order ${data.orderId}`
          );
        }
      });

      console.log("✅ Kafka Consumer Connected");
      break;

    } catch (err) {
      console.log("⏳ Waiting for Kafka...");
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

connectKafka();

/* ---------------- HEALTH ---------------- */

app.get("/health", (req, res) => {
  res.json({
    service: "notification-service",
    status: "UP"
  });
});

/* ---------------- EMAIL ---------------- */

app.post("/email", (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({
        error: "Missing fields"
      });
    }

    console.log("EMAIL SENT");
    console.log(to, subject, message);

    res.json({
      success: true
    });

  } catch {
    res.status(500).json({
      error: "Email failed"
    });
  }
});

/* ---------------- SMS ---------------- */

app.post("/sms", (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        error: "Missing fields"
      });
    }

    console.log("SMS SENT");
    console.log(phone, message);

    res.json({
      success: true
    });

  } catch {
    res.status(500).json({
      error: "SMS failed"
    });
  }
});

/* ---------------- METRICS ---------------- */

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.NOTIFICATION_PORT || 4005;

app.listen(PORT, () => {
  console.log(`Notification Service running on port ${PORT}`);
});