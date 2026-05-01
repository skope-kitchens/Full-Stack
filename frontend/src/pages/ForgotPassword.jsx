import { useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'
import api from '../utils/api'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/password-reset/request', { email })
      setSubmitted(true)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to request reset link')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <Layout>
        <div className="h-[90vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full">
            <div className="card bg-[url('/assets/Main-bg.png')] bg-cover bg-center bg-no-repeat text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">Check Your Email</h2>
              <p className="text-gray-600 mb-6">
                If this email is registered, you will receive password reset instructions.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center justify-center px-8 py-4 bg-black text-white text-lg font-medium rounded-lg shadow-md transition-colors group"
              >
                <span className="relative block overflow-hidden">
                  <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                    <span className="block">Baack to Login</span>
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                    Back to Login
                  </span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="h-[90vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Skope Kitchens</h1>
            <h2 className="text-2xl font-semibold text-gray-900">Reset Password</h2>
          </div>

          <div className="card bg-[url('/assets/Main-bg.png')] bg-cover bg-center bg-no-repeat">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-900 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input-field"
                  placeholder="Enter your email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="relative w-full inline-flex items-center justify-center btn-primary bg-black text-white hover:bg-black hover:text-white disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
              >
                {loading ? (
                  // No animation while loading
                  <span>Sending...</span>
                ) : (
                  // Text slide animation
                  <span className="relative block overflow-hidden">
                    {/* First text - slides UP */}
                    <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                      <span className="block">Send Reset Link</span>
                    </span>

                    {/* Second text - slides IN from bottom */}
                    <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                      Send Reset Link
                    </span>
                  </span>
                )}
              </button>

              {error && (
                <div className="text-sm text-red-700 mt-3 text-center">
                  {error}
                </div>
              )}

            </form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="text-sm text-black hover:text-white font-medium"
              >
                Back to Login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default ForgotPassword

