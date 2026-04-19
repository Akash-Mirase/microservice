const express = require('express');
const app = express();

const PORT = 3003;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Order Service Running 📦');
});

app.get('/orders', (req, res) => {
  res.json([
    { id: 101, item: "Laptop" },
    { id: 102, item: "Phone" }
  ]);
});

// ✅ Prometheus metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');

  const memory = process.memoryUsage().heapUsed / 1024 / 1024;
  const uptime = process.uptime();

  res.send(`
# HELP order_service_memory Memory usage in MB
# TYPE order_service_memory gauge
order_service_memory ${memory}

# HELP order_service_uptime Uptime in seconds
# TYPE order_service_uptime counter
order_service_uptime ${uptime}
  `);
});

app.listen(PORT, () => {
  console.log(`Order Service running on port ${PORT}`);
});