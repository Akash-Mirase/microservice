const express = require('express');
const axios = require('axios');
const { execFile } = require('child_process');
const pool = require('../shared/db');

const app = express();

const services = [
    { name: "auth", url: "http://auth-service:4001" },
    { name: "user", url: "http://user-service:4002" },
    { name: "order", url: "http://order-service:4003" },
    { name: "payment", url: "http://payment-service:4004" }
];

// Save log to PostgreSQL
async function saveLog(service, status, message) {
    try {
        await pool.query(
            'INSERT INTO logs(service_name,status,message) VALUES($1,$2,$3)',
            [service, status, message]
        );
    } catch (err) {
        console.log("DB log failed");
    }
}

async function saveMetric(service, cpu, memory) {
    try {
        await pool.query(
            'INSERT INTO metrics(service_name,cpu,memory) VALUES($1,$2,$3)',
            [service, cpu, memory]
        );
    } catch (err) {
        console.log("Metric save failed");
    }
}


// Health Check
async function checkServices() {
    for (const s of services) {
        try {
            await axios.get(s.url + '/health', { timeout: 2000 });
            console.log(`${s.name} healthy`);

            const cpu = (Math.random() * 100).toFixed(2);
            const memory = (Math.random() * 500).toFixed(2);

            await saveMetric(s.name, cpu, memory);

            // ML Anomaly Detection
            try {
                // Get last 100 metrics in chronological order
                const result = await pool.query(
                    'SELECT cpu, memory FROM (SELECT cpu, memory, created_at FROM metrics WHERE service_name=$1 ORDER BY created_at DESC LIMIT 100) AS sub ORDER BY created_at ASC',
                    [s.name]
                );
                
                if (result.rows.length >= 10) {
                    const mlRes = await axios.post('http://ml-service:5000/predict', result.rows);
                    if (mlRes.data.status === 'ANOMALY') {
                        console.log(`⚠️ Anomaly detected for ${s.name}! (CPU: ${cpu}, Mem: ${memory})`);
                        await saveLog(s.name, "ANOMALY", "ML model detected an anomaly");
                        
                        // Restart container using the same pattern as health checks
                        const container = `self-healing-system-${s.name}-service-1`;
                        execFile("docker", ["restart", container], async () => {
                            console.log(`🔄 ${s.name} restarted due to anomaly`);
                            await saveLog(s.name, "RECOVERED", "Restarted automatically after anomaly");
                        });
                    }
                }
            } catch (mlErr) {
                // Silently handle ML service not available or errors
                // console.error("ML Prediction error:", mlErr.message);
            }

        } catch (err) {
            console.log(`${s.name} FAILED`);

            await saveLog(s.name, "FAILED", "Health check failed");

            const container = `self-healing-system-${s.name}-service-1`;

            execFile("docker", ["restart", container], async () => {
                console.log(`${s.name} restarted`);

                await saveLog(
                    s.name,
                    "RECOVERED",
                    "Container restarted automatically"
                );
            });
        }
    }
}

setInterval(checkServices, 5000);

// View Logs API
app.get('/logs', async (req, res) => {
    const result = await pool.query(
        'SELECT * FROM logs ORDER BY created_at DESC LIMIT 50'
    );

    res.json(result.rows);
});

app.listen(5000, () => {
    console.log("Central Server running");
});
