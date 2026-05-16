const AUTH_TOKEN_KEY = 'skope_auth_token'
const AUTH_ROLE_KEY = 'skope_auth_role'
const AUTH_USERTYPE_KEY = 'skope_auth_usertype'
const USER_KEY = 'skope_user'

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
    } catch (error) {
      console.error('Error clearing authentication:', error)
    }
  },
}
