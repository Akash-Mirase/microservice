const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

app.post('/order', async (req, res) => {
    try {
        console.log("Processing order...");
        // Call payment service
        const payment = await axios.post('http://payment-service:4004/pay');

        res.send({
            message: "Order placed",
            payment: payment.data
        });

    } catch (err) {
        console.log("Payment failed:", err.message);
        res.status(500).send("Order failed due to payment issue");
    }


});

app.get('/health', (req, res) => {
    res.send({ status: "OK", service: "order-service" });
});

app.listen(4003, () => {
    console.log("Order Service running on 4003");
});
