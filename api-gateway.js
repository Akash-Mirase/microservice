const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// ORDER API
app.post('/order', async (req, res) => {
    try {
        console.log("Calling order service...");

        const response = await axios.post('http://order-service:4003/order');

        console.log("Order response:", response.data);

        res.send(response.data);

    } catch (err) {
        console.log("ERROR:", err.message);
        res.status(500).send("Order failed");
    }

});

app.get('/health', (req, res) => {
    res.send({ status: "OK", service: "api-gateway" });
});

app.listen(4000, () => {
    console.log("API Gateway running on 4000");
});
