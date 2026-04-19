const express = require('express');
const app = express();

app.use(express.json());

app.post('/login', (req, res) => {
    res.send({ token: "fake-token" });
});

app.get('/health', (req, res) => {
    res.send({ status: "OK", service: "payment-service" });
});

app.listen(4004, () => {
    console.log("Payment Service running on 4004");
});
