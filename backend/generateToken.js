import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'
dotenv.config()


const API_KEY = process.env.RISTA_API_KEY
const SECRET_KEY = process.env.RISTA_SECRET_KEY

const payload = {
  iss: API_KEY,
  iat: Math.floor(Date.now() / 1000),
}

const token = jwt.sign(payload, SECRET_KEY)

console.log('JWT:', token)
