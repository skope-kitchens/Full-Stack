import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Layout from '../components/Layout'
import { authUtils } from '../utils/auth'
import api from '../utils/api';

const Login = () => {
  const navigate = useNavigate()

  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })

  const [status, setStatus] = useState({ type: '', message: '' })
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
    setStatus({ type: '', message: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus({ type: '', message: '' })

    try {
      console.log("API URL:", import.meta.env.VITE_API_BASE_URL);
      const { data } = await api.post('/api/auth/login', {
        email: formData.email,
        password: formData.password
      })

      // Primary auth storage: token + role decoded from JWT.
      // Role is derived from the JWT itself — no separate adminRole storage needed.
      authUtils.setAuth(data.token, data.userType);

      // Keep localStorage["token"] for the api.js interceptor fallback.
      localStorage.setItem("token", data.token);
      localStorage.setItem("userType", data.userType);

      // Save user/vendor profile object when present (not applicable for admins).
      if (data.user || data.vendor) {
        sessionStorage.setItem(
          "skope_user",
          JSON.stringify(data.user || data.vendor)
        );
      }


      setStatus({
        type: 'success',
        message: 'Login successful! Redirecting...'
      })

      // redirect to dashboard
      setTimeout(() => navigate('/'), 600)

    } catch (error) {
      console.error("LOGIN ERROR:", error);
      const message =
        error.response?.data?.message ||
        'Unable to login. Please check your credentials.'

      setStatus({ type: 'error', message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Layout>
      <div className="h-[90vh] flex items-center justify-center py-4 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">

          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Skope Kitchens</h1>
            <h2 className="text-xl font-semibold text-gray-800">
              Login
            </h2>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              initial={{ x: 80, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -80, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="card bg-[url('/assets/Main-bg.png')] bg-cover bg-center bg-no-repeat p-6 rounded-2xl"
            >

              <form onSubmit={handleSubmit} className="space-y-6">

                {status.message && (
                  <div
                    className={`px-4 py-3 rounded-lg text-sm ${
                      status.type === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    {status.message}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Email
                  </label>
                  <input
                    type="text"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    className="input-field"
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Password
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    required
                    className="input-field"
                    placeholder="Enter your password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full inline-flex items-center justify-center bg-black text-white rounded-lg py-3"
                >
                  {loading ? "Please wait..." : "Login"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  Don't have an account?{' '}
                  <Link to="/signup" className="text-black hover:text-white font-medium">
                    Sign up
                  </Link>
                </p>

                <div className="mt-3">
                  <Link
                    to="/forgot-password"
                    className="text-sm text-black underline hover:text-gray-700"
                  >
                    Forgot Password?
                  </Link>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Layout>
  )
}

export default Login
