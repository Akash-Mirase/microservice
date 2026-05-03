const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const Joi = require('joi')
const dotenv = require('dotenv')
const { Pool } = require('pg')

dotenv.config()

const app = express()
app.use(express.json())

/*  DATABASE  */

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
})

/*  VALIDATION  */

const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).max(20).required()
})

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
})

/*  ROUTES  */

/* Health Check */
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'auth-service',
    status: 'UP'
  })
})

/* Register */
app.post('/register', async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body)

    if (error) {
      return res.status(400).json({
        error: error.details[0].message
      })
    }

    const { name, email, password } = req.body

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email=$1',
      [email]
    )

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Email already registered'
      })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    await pool.query(
      'INSERT INTO users(name,email,password) VALUES($1,$2,$3)',
      [name, email, hashedPassword]
    )

    res.status(201).json({
      message: 'User registered successfully'
    })
  } catch (err) {
    console.error(err)

    res.status(500).json({
      error: 'Internal server error'
    })
  }
})

/* Login */
app.post('/login', async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body)

    if (error) {
      return res.status(400).json({
        error: error.details[0].message
      })
    }

    const { email, password } = req.body

    const result = await pool.query('SELECT * FROM users WHERE email=$1', [
      email
    ])

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Invalid credentials'
      })
    }

    const user = result.rows[0]

    const match = await bcrypt.compare(password, user.password)

    if (!match) {
      return res.status(401).json({
        error: 'Invalid credentials'
      })
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    )

    res.status(200).json({
      message: 'Login successful',
      token
    })
  } catch (err) {
    console.error(err)

    res.status(500).json({
      error: 'Internal server error'
    })
  }
})

/*  SERVER  */

const PORT = process.env.AUTH_PORT || 4001
const client = require('prom-client')
client.collectDefaultMetrics()

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType)
  res.end(await client.register.metrics())
})

app.listen(PORT, () => {
  console.log(`Auth Service running on port ${PORT}`)
})
