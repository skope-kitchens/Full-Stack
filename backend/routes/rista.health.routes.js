import express from 'express'
import { ristaClient } from '../ristaClient.js'

const router = express.Router()

// TEMP DEBUG ENDPOINT: Check Rista connectivity & auth
// GET /api/rista/health
router.get('/health', async (req, res) => {
  try {
    const result = await ristaClient.healthCheck()

    if (result.ok) {
      return res.json({
        ok: true,
        status: result.status,
        // Keep payload small but informative
        info: {
          hasData: !!result.raw,
        },
      })
    }

    return res.status(result.status || 500).json({
      ok: false,
      status: result.status || 500,
      error: result.error,
    })
  } catch (error) {
    console.error('[RISTA DEBUG] /api/rista/health handler error:', error)
    return res.status(500).json({
      ok: false,
      error: error.message || 'Unexpected health check error',
    })
  }
})

export default router


