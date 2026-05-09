const express = require("express");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const { createClient } = require("redis");
const cors = require("cors");

const redisClient = createClient({
  url: "redis://redis:6379"
});

redisClient.connect()
  .then(() => console.log("✅ Redis Connected"))
  .catch(err => console.log(err));

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

/* ---------------- DATABASE ---------------- */

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

/* ---------------- HEALTH ---------------- */

app.get("/health", (req, res) => {
  res.json({
    service: "user-service",
    status: "UP"
  });
});

/* ---------------- GET PROFILE ---------------- */

app.get("/profile", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const cacheKey = `user:${userId}`;

    const cachedUser =
      await redisClient.get(cacheKey);

    if (cachedUser) {
      return res.json(JSON.parse(cachedUser));
    }

    const result = await pool.query(
      "SELECT id,name,email FROM users WHERE id=$1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    await redisClient.set(
      cacheKey,
      JSON.stringify(result.rows[0]),
      { EX: 60 }
    );

    res.json(result.rows[0]);

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch profile"
    });
  }
});

/* ---------------- UPDATE PROFILE ---------------- */

app.put("/profile", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];
    const { name } = req.body;

    const result = await pool.query(
      "UPDATE users SET name=$1 WHERE id=$2 RETURNING id,name,email",
      [name, userId]
    );

    res.json({
      message: "Profile updated",
      user: result.rows[0]
    });

  } catch {
    res.status(500).json({
      error: "Update failed"
    });
  }
});

/* ---------------- DELETE USER ---------------- */

app.delete("/profile", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"];

    await pool.query(
      "DELETE FROM users WHERE id=$1",
      [userId]
    );

    res.json({
      message: "User deleted"
    });

  } catch {
    res.status(500).json({
      error: "Delete failed"
    });
  }
});

/* ---------------- SERVER ---------------- */

const PORT = process.env.USER_PORT || 4002;
const client = require("prom-client");
client.collectDefaultMetrics();

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});