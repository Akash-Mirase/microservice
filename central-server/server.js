const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');

const app = express();

const services = [
    { name: "auth", url: "http://auth-service:4001" },
    { name: "user", url: "http://user-service:4002" },
    { name: "order", url: "http://order-service:4003" },
    { name: "payment", url: "http://payment-service:4004" }
];

// Health check
async function checkServices() {
    for (const s of services) {
        try {
            await axios.get(s.url + '/health', { timeout: 2000 });
            console.log(`${s.name} is healthy`);
        } catch (err) {
            console.log(`${s.name} FAILED`);


            const containerName = `self-healing-system-${s.name}-service-1`;

            exec(`docker restart "${containerName}"`, (error, stdout, stderr) => {
                if (error) {
                    console.log(`Restart failed for ${s.name}`);
                    console.log(stderr);
                } else {
                    console.log(`${s.name} restarted successfully`);
                }
            });
        }
    }
}

// Run every 5 sec
setInterval(checkServices, 5000);

app.listen(5000, () => {
    console.log("Central Monitoring Server running on 5000");
});
