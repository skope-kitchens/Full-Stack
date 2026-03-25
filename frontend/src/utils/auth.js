const AUTH_TOKEN_KEY = 'skope_auth_token'
const USER_KEY = 'skope_user'

export const authUtils = {
  isAuthenticated: () => {
    try {
      const token = sessionStorage.getItem(AUTH_TOKEN_KEY)
      return !!token
    } catch (error) {
      return false
    }
  },

  setAuth: (token, user = null) => {
    try {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
      if (user) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(user))
      }
    } catch (error) {
      console.error('Error setting authentication:', error)
    }
  },

  getUser: () => {
    try {
      const userStr = sessionStorage.getItem(USER_KEY)
      return userStr ? JSON.parse(userStr) : null
    } catch (error) {
      return null
    }
  },

  clearAuth: () => {
    try {
      sessionStorage.removeItem(AUTH_TOKEN_KEY)
      sessionStorage.removeItem(USER_KEY)
    } catch (error) {
      console.error('Error clearing authentication:', error)
    }
  }
}
