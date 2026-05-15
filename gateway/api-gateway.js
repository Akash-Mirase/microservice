const express = require("express");
const dotenv = require("dotenv");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { createProxyMiddleware } = require("http-proxy-middleware");
const logger = require('../shared/logger')('auth-service')

dotenv.config();

const app = express();
/*  SECURITY  */

app.use(helmet());

app.use(cors());

app.use(morgan("dev"));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests. Try again later."
}));

/*  JWT MIDDLEWARE  */

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "Token missing"
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();

  } catch {
    return res.status(401).json({
      error: "Invalid token"
    });
  }
}

/*  HEALTH  */

app.get("/health", (req, res) => {
  res.json({
    service: "api-gateway",
    status: "UP"
  });
});

/*  PUBLIC ROUTES  */

app.use("/auth", createProxyMiddleware({
  target: "http://auth-service:4001",
  changeOrigin: true,
  pathRewrite: {
    "^/auth": ""
  },
  proxyTimeout: 5000,
  timeout: 5000
}));;

/*  PROTECTED ROUTES  */

app.use("/users",
  verifyToken,
  createProxyMiddleware({
    target: "http://user-service:4002",
    changeOrigin: true,
    pathRewrite: {
      "^/users": ""
    },
    onProxyReq: (proxyReq, req, res) => {
      proxyReq.setHeader("x-user-id", req.user.id);
    }
  })
);

app.use("/orders",
  verifyToken,
  createProxyMiddleware({
    target: "http://order-service:4003",
    changeOrigin: true,
    pathRewrite: {
      "^/orders": ""
    }
  })
);

app.use("/payments",
  verifyToken,
  createProxyMiddleware({
    target: "http://payment-service:4004",
    changeOrigin: true,
    pathRewrite: {
      "^/payments": ""
    }
  })
);

/*  ERROR HANDLER  */

app.use((err, req, res, next) => {
  console.error(err);

  res.status(500).json({
    error: "Gateway error"
  });
});

/*  SERVER  */

const PORT = process.env.GATEWAY_PORT || 4000;

const client = require("prom-client");
client.collectDefaultMetrics();

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});