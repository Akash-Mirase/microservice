const express = require('express');
const app = express();

app.use(express.json());

app.post('/login', (req, res) => {
    res.send({ token: "fake-token" });
});

app.get('/health', (req, res) => {
    res.send({ status: "OK", service: "auth-service" });
});

app.listen(4001, () => {
    console.log("Auth Service running on 4001");
});
