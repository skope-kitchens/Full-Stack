import express from 'express'
import {
  login,
  signup,
  getCredits,
  requestPasswordReset,
  confirmPasswordReset
} from '../controllers/auth.controller.js'
import { authMiddleware } from "../middleware/auth.js";

const router = express.Router()


router.post('/signup', signup )
router.get("/credits", authMiddleware, getCredits);
router.post('/login', login)

// Password reset flow
router.post('/password-reset/request', requestPasswordReset)
router.post('/password-reset/confirm', confirmPasswordReset)

export default router

