const express = require('express');
const app = express();

const PORT = 3004;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Payment Service Running 💳');
});

app.get('/pay', (req, res) => {
  res.json({ message: "Payment successful" });
});

// ✅ Prometheus metrics
app.get('/metrics', (req, res) => {
  res.set('Content-Type', 'text/plain');

  const memory = process.memoryUsage().heapUsed / 1024 / 1024;
  const uptime = process.uptime();

  res.send(`
# HELP payment_service_memory Memory usage in MB
# TYPE payment_service_memory gauge
payment_service_memory ${memory}

# HELP payment_service_uptime Uptime in seconds
# TYPE payment_service_uptime counter
payment_service_uptime ${uptime}
  `);
});

app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`);
});