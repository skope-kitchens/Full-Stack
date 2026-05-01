import express from 'express'
import jwt from 'jsonwebtoken'
import {
  login,
  signup,
  getCredits,
  requestPasswordReset,
  confirmPasswordReset
} from '../controllers/auth.controller.js'
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router()

const createToken = (user) => {
  const secret = process.env.JWT_SECRET || 'development-secret'

  return jwt.sign(
    {
      userId: user._id,
      brandName: user.brandName,
    },
    secret,
    { expiresIn: '7d' }
  )
}



const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  brandName: user.brandName,
  email: user.email,
  address: user.address,
})


router.post('/signup', signup )
router.get("/credits", authMiddleware, getCredits);
router.post('/login', login)

// Password reset flow
router.post('/password-reset/request', requestPasswordReset)
router.post('/password-reset/confirm', confirmPasswordReset)

export default router

