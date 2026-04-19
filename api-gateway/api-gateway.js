const express = require('express');
const app = express();

const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('API Gateway Running 🚀');
});

app.get('/status', (req, res) => {
  res.json({ message: "Gateway is active" });
});

// ✅ Prometheus metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');

  const memory = process.memoryUsage().heapUsed / 1024 / 1024;
  const uptime = process.uptime();

  res.send(`
# HELP api_gateway_memory Memory usage in MB
# TYPE api_gateway_memory gauge
api_gateway_memory ${memory}

# HELP api_gateway_uptime Uptime in seconds
# TYPE api_gateway_uptime counter
api_gateway_uptime ${uptime}
  `);
});

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
});