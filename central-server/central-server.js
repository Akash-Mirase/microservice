const axios = require('axios');
const { exec } = require('child_process');

// Services to monitor
const services = [
  { name: "user-service", url: "http://user-service:3001/metrics" },
  { name: "auth-service", url: "http://auth-service:3002/metrics" },
  { name: "order-service", url: "http://order-service:3003/metrics" },
  { name: "payment-service", url: "http://payment-service:3004/metrics" }
];

// Check every 10 seconds
setInterval(async () => {
  console.log("🔍 Checking services...");

  for (let service of services) {
    try {
      await axios.get(service.url);
      console.log(`✅ ${service.name} is healthy`);
    } catch (error) {
      console.log(`🔥 Anomaly detected in ${service.name}`);
      
      console.log(`🔁 Restarting ${service.name}...`);

      exec(`docker restart microservice-${service.name}-1`, (err, stdout, stderr) => {
        if (err) {
          console.log(`❌ Failed to restart ${service.name}`);
        } else {
          console.log(`✅ ${service.name} restarted successfully`);
        }
      });
    }
  }

}, 10000);