const express = require('express');
const app = express();

app.use(express.json());

app.post('/login', (req, res) => {
    res.send({ token: "fake-token" });
});

app.get('/health', (req, res) => {
    res.send({ status: "OK", service: "user-service" });
});

app.listen(4002, () => {
    console.log("User Service running on 4002");
});
