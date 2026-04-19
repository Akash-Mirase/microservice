const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
    res.status(200).json({
        service: "auth",
        status: "UP",
        time: new Date()
    });
});

app.post('/login', (req, res) => {
    res.send({ token: "fake-token" });
});

app.listen(4004, () => {
    console.log("Payment Service running on 4004");
});
