const express = require('express');
const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({
        service: "user",
        status: "UP"
    });
});


app.post('/login', (req, res) => {
    res.send({ token: "fake-token" });
});

app.listen(4002, () => {
    console.log("User Service running on 4002");
});
