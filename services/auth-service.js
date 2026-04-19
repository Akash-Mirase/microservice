const express = require('express');
const pool = require('../shared/db');

const app = express();
app.use(express.json());

/* Health Check */
app.get('/health', (req, res) => {
    res.status(200).json({
        service: 'auth',
        status: 'UP'
    });
});

/* Register */
app.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;


        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields required'
            });
        }

        const exists = await pool.query(
            'SELECT * FROM users WHERE email=$1',
            [email]
        );

        if (exists.rows.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'User already exists'
            });
        }

        const result = await pool.query(
            'INSERT INTO users(name,email,password) VALUES($1,$2,$3) RETURNING id,name,email',
            [name, email, password]
        );

        res.status(201).json({
            success: true,
            message: 'User registered',
            user: result.rows[0]
        });


    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Register failed'
        });
    }
});

/* Login */
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password required'
            });
        }

        const result = await pool.query(
            'SELECT * FROM users WHERE email=$1 AND password=$2',
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: result.rows[0].id,
                name: result.rows[0].name,
                email: result.rows[0].email
            }
        });


    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

app.listen(4001, () => {
    console.log('Auth service running on 4001');
});
