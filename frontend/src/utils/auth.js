const AUTH_TOKEN_KEY = 'skope_auth_token'
const AUTH_ROLE_KEY = 'skope_auth_role'
const AUTH_USERTYPE_KEY = 'skope_auth_usertype'
const USER_KEY = 'skope_user'
const AUTH_BRANCH_CODE_KEY = 'skope_auth_branch_code'
const AUTH_WAREHOUSE_ID_KEY = 'skope_auth_warehouse_id'
const AUTH_BRANCH_CODES_KEY = 'skope_auth_branch_codes'

/**
 * Decode the payload of a JWT without verifying the signature.
 * Verification is the server's responsibility. On the client, we only
 * need to read the payload (role, adminId, etc.) for UI decisions.
 */
function decodeJWTPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export const authUtils = {
  /**
   * Store auth state after a successful login.
   * Decodes the JWT to extract role — this eliminates the adminRole localStorage
   * desync problem by making role always derived from the actual token.
   */
  setAuth: (token, userType = null) => {
    try {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)

      const decoded = decodeJWTPayload(token)
      if (decoded?.role) {
        sessionStorage.setItem(AUTH_ROLE_KEY, decoded.role)
      }
      if (decoded?.branchCode) {
        sessionStorage.setItem(AUTH_BRANCH_CODE_KEY, decoded.branchCode)
      } else {
        sessionStorage.removeItem(AUTH_BRANCH_CODE_KEY)
      }
      if (decoded?.warehouseId) {
        sessionStorage.setItem(AUTH_WAREHOUSE_ID_KEY, decoded.warehouseId)
      } else {
        sessionStorage.removeItem(AUTH_WAREHOUSE_ID_KEY)
      }
      if (Array.isArray(decoded?.branchCodes) && decoded.branchCodes.length) {
        sessionStorage.setItem(AUTH_BRANCH_CODES_KEY, JSON.stringify(decoded.branchCodes))
      } else {
        sessionStorage.removeItem(AUTH_BRANCH_CODES_KEY)
      }
      if (userType) {
        sessionStorage.setItem(AUTH_USERTYPE_KEY, userType)
      }
    } catch (error) {
      console.error('Error setting authentication:', error)
    }
  },

  isAuthenticated: () => {
    try {
      return !!sessionStorage.getItem(AUTH_TOKEN_KEY)
    } catch {
      return false
    }
  },

  /**
   * Role derived directly from the JWT stored in sessionStorage.
   * This is the single authoritative source of role for all UI decisions.
   * It cannot desync from the backend because it reads the same JWT the
   * backend will decode when requests are sent.
   */
  getRole: () => {
    try {
      return sessionStorage.getItem(AUTH_ROLE_KEY) || null
    } catch {
      return null
    }
  },

  getBranchCode: () => {
    try {
      return sessionStorage.getItem(AUTH_BRANCH_CODE_KEY) || null
    } catch {
      return null
    }
  },

  getWarehouseId: () => {
    try {
      return sessionStorage.getItem(AUTH_WAREHOUSE_ID_KEY) || null
    } catch {
      return null
    }
  },

  getBranchCodes: () => {
    try {
      const raw = sessionStorage.getItem(AUTH_BRANCH_CODES_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  },

  getUserType: () => {
    try {
      return sessionStorage.getItem(AUTH_USERTYPE_KEY) || null
    } catch {
      return null
    }
  },

  getToken: () => {
    try {
      return sessionStorage.getItem(AUTH_TOKEN_KEY) || null
    } catch {
      return null
    }
  },

  getUser: () => {
    try {
      const userStr = sessionStorage.getItem(USER_KEY)
      return userStr ? JSON.parse(userStr) : null
    } catch {
      return null
    }
  },

  clearAuth: () => {
    try {
      sessionStorage.removeItem(AUTH_TOKEN_KEY)
      sessionStorage.removeItem(AUTH_ROLE_KEY)
      sessionStorage.removeItem(AUTH_USERTYPE_KEY)
      sessionStorage.removeItem(USER_KEY)
      sessionStorage.removeItem(AUTH_BRANCH_CODE_KEY)
      sessionStorage.removeItem(AUTH_WAREHOUSE_ID_KEY)
      sessionStorage.removeItem(AUTH_BRANCH_CODES_KEY)
    } catch (error) {
      console.error('Error clearing authentication:', error)
    }
  },
}
