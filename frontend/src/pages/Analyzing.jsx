import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'

const Analyzing = () => {
  const navigate = useNavigate()

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/result')
    }, 2500)

    return () => clearTimeout(timer)
  }, [navigate])

  return (
    <Layout>
      <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl w-full">
          <div className="card text-center">
            <div className="mb-8">
              <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-primary-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-3">
                Analyzing your eligibility...
              </h2>
              <p className="text-gray-600">
                We're evaluating your profile using our AI engine.
              </p>
            </div>

            {/* Skeleton Loaders */}
            <div className="space-y-6">
              {/* Rating Card Skeleton */}
              <div className="bg-gray-50 rounded-lg p-6">
                <div className="skeleton h-8 w-48 mx-auto mb-4"></div>
                <div className="skeleton h-16 w-32 mx-auto"></div>
              </div>

              {/* Analysis Summary Skeleton */}
              <div className="space-y-3">
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-4 w-full"></div>
                <div className="skeleton h-4 w-3/4"></div>
              </div>

              {/* Key Points Skeleton */}
              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <div className="skeleton h-24 w-full rounded-lg"></div>
                <div className="skeleton h-24 w-full rounded-lg"></div>
                <div className="skeleton h-24 w-full rounded-lg"></div>
                <div className="skeleton h-24 w-full rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

export default Analyzing

