const express = require('express');
const app = express();

const PORT = 3002;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Auth Service Running 🔐');
});

app.get('/login', (req, res) => {
  res.json({ message: "Login successful" });
});

// ✅ Prometheus metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');

  const memory = process.memoryUsage().heapUsed / 1024 / 1024;
  const uptime = process.uptime();

  res.send(`
# HELP auth_service_memory Memory usage in MB
# TYPE auth_service_memory gauge
auth_service_memory ${memory}

# HELP auth_service_uptime Uptime in seconds
# TYPE auth_service_uptime counter
auth_service_uptime ${uptime}
  `);
});

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`);
});