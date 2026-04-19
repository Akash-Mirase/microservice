const express = require('express');
const app = express();

const PORT = 3001;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('User Service Running 🚀');
});

app.get('/users', (req, res) => {
  res.json([
    { id: 1, name: "Atharv" },
    { id: 2, name: "User2" }
  ]);
});

// ✅ Prometheus metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');

  const memory = process.memoryUsage().heapUsed / 1024 / 1024;
  const uptime = process.uptime();

  res.send(`
# HELP user_service_memory Memory usage in MB
# TYPE user_service_memory gauge
user_service_memory ${memory}

# HELP user_service_uptime Uptime in seconds
# TYPE user_service_uptime counter
user_service_uptime ${uptime}
  `);
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});