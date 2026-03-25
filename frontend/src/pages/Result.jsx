import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout'

// Tier helper based on raw score
const deriveTierInfo = (score) => {
  const rawScore = Number(score) || 0

  let tier = 'tier_1'
  let tierLabel = ''
  let tierMessage = ''
  let bgClass = '' // used for the rating card background

  if (rawScore < 4) {
    tier = 'tier_1'
    tierLabel = 'Needs Significant Improvement'
    tierMessage =
      'Your current score indicates the brand is not yet ready for onboarding. We recommend working on core performance areas and revisiting after improvements.'
    bgClass = 'bg-red-50 border-red-200'
  } else if (rawScore >= 4 && rawScore < 6) {
    tier = 'tier_2'
    tierLabel = 'Promising but Needs Improvement'
    tierMessage =
      'Your score is good, but there is still room for improvement. Please schedule a call with our internal team to understand how you can meet the onboarding criteria.'
    bgClass = 'bg-yellow-50 border-yellow-200'
  } else if (rawScore >= 6 && rawScore < 8) {
    tier = 'tier_3'
    tierLabel = 'Strong Candidate'
    tierMessage =
      'Your brand is performing well and is close to onboarding readiness. A discussion with our team can help unlock the remaining potential.'
    bgClass = 'bg-amber-50 border-amber-200'
  } else {
    tier = 'tier_4'
    tierLabel = 'Top Tier Brand'
    tierMessage =
      'Excellent performance! Your brand falls in our highest tier. Our team will reach out to complete onboarding, or you can schedule a call at your convenience.'
    bgClass = 'bg-green-50 border-green-200'
  }

  return { tier, tierLabel, tierMessage, bgClass }
}

// Simple score bar "graph"
const ScoreBar = ({ score }) => {
  const clamped = Math.max(0, Math.min(10, Number(score) || 0))
  const percent = (clamped / 10) * 100

  return (
    <div className="mt-4">
      <div className="relative h-3 rounded-full bg-gray-200 overflow-hidden">
        {/* Background gradient for 4 bands */}
        <div className="absolute inset-0 bg-gradient-to-r from-red-400 via-yellow-300  to-green-500 opacity-60" />
        {/* Marker for current score */}
        <div
          className="absolute top-1/2 w-0.5 h-5 bg-black transform -translate-y-1/2"
          style={{ left: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>0–4: Needs Improvement</span>
        <span>4–6: Promising</span>
        <span>6–8: Strong</span>
        <span>8–10: Top Tier</span>
      </div>
    </div>
  )
}

const Result = () => {
  const [scoreData, setScoreData] = useState(null)
  const [isOnboarded, setIsOnboarded] = useState(true)
  const [rating, setRating] = useState(9.1)
  const [tier, setTier] = useState('tier_4')
  const [tierLabel, setTierLabel] = useState('')
  const [tierMessage, setTierMessage] = useState('')
  const [tierBgClass, setTierBgClass] = useState('bg-green-50 border-green-200')
  const [sectionScores, setSectionScores] = useState(null)

  useEffect(() => {
    try {
      const storedScore = localStorage.getItem('eligibilityScore')
      if (storedScore) {
        const parsed = JSON.parse(storedScore)

        const ratingValue = Number(parsed.score) || 0
        setScoreData(parsed)
        setRating(ratingValue)
        setSectionScores(parsed.sectionScores || null)

        const onboardedFromBackend =
          parsed.onboardingStatus === 'ONBOARDED' ||
          (!!parsed.meetsThreshold && ratingValue >= 8.5)

        setIsOnboarded(onboardedFromBackend)

        // Tier: prefer backend if present, else derive from score
        const baseTierInfo = deriveTierInfo(ratingValue)
        setTier(parsed.tier || baseTierInfo.tier)
        setTierLabel(parsed.tierLabel || baseTierInfo.tierLabel)
        setTierMessage(parsed.tierMessage || baseTierInfo.tierMessage)
        setTierBgClass(baseTierInfo.bgClass)
      } else {
        // Fallback if no score data found
        const fallbackScore = 8.6
        setRating(fallbackScore)
        setIsOnboarded(true)
        const t = deriveTierInfo(fallbackScore)
        setTier(t.tier)
        setTierLabel(t.tierLabel)
        setTierMessage(t.tierMessage)
        setTierBgClass(t.bgClass)
      }
    } catch (error) {
      console.error('Error reading eligibility score:', error)
      const fallbackScore = 8.6
      setRating(fallbackScore)
      setIsOnboarded(true)
      const t = deriveTierInfo(fallbackScore)
      setTier(t.tier)
      setTierLabel(t.tierLabel)
      setTierMessage(t.tierMessage)
      setTierBgClass(t.bgClass)
    }
  }, [])

  // Get AI-generated analysis summary from stored score data
  const aiAnalysisSummary =
    scoreData?.aiAnalysisSummary ||
    (isOnboarded
      ? 'Your brand demonstrates excellent consistency across mapping, operations, and expansion potential. The current scale and partner portfolio align perfectly with Skope Kitchens standards.'
      : 'We spotted a few gaps in your eligibility profile. Address the highlighted points and consider re-submitting for a fresh evaluation.')

  const result = isOnboarded
    ? {
        rating,
        analysisSummary: aiAnalysisSummary,
        suggestions: [],
      }
    : {
        rating,
        analysisSummary: aiAnalysisSummary,
        suggestions: [
          'Improve brand strength by expanding outlet presence or market penetration.',
          'Enhance social media engagement and follower base.',
          'Optimize delivery sales and average order value.',
          'Reduce COGS percentage to improve margins.',
          'Consider reducing menu complexity or wastage risk.',
          'Address special conditions that may impact operations.',
        ],
      }

  return (
    <Layout>
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          {isOnboarded ? (
            // ✅ Onboarded / High-tier State
            <div className="card text-center bg-[url('/assets/Main-bg.png')] bg-cover bg-center bg-no-repeat">
              

              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Congratulations!
              </h1>
              <p className="text-lg font-semibold text-gray-900 mb-2">
                {tierLabel || 'Top Tier Brand'}
              </p>
              <p className="text-base text-gray-900 mb-8">
                {tierMessage ||
                  'You’re almost there — just one step away from being onboarded as a Skope Kitchens vendor. Feel free to schedule a call whenever it suits you.'}
              </p>

              {/* Rating Display */}
              <div className={`rounded-xl p-8 mb-8 border ${tierBgClass}`}>
                <p className="text-sm text-gray-600 mb-2">Your Rating</p>
                <div className="text-6xl font-bold text-black mb-2">
                  {result.rating.toFixed(1)}
                  <span className="text-2xl text-gray-500">/10</span>
                </div>
                <div className="flex justify-center items-center space-x-1 mt-4">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full ${
                        i < Math.round(result.rating)
                          ? 'bg-black'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                {/* Graph / Score Bar */}
                <ScoreBar score={result.rating} />
              </div>

              {/* Analysis Summary */}
              <div className="bg-gray-50 rounded-lg p-6 mb-8 text-left">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Analysis Summary
                </h2>
                <p className="text-gray-900 leading-relaxed">
                  {result.analysisSummary}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center px-8 py-4 bg-black text-white text-lg font-medium rounded-lg shadow-md transition-colors group"
                >
                  <span className="relative block overflow-hidden">
                    <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                      <span className="block">Back to Home</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                      Back to Home
                    </span>
                  </span>
                </Link>
                <Link
                  to="contact-us"
                  className="inline-flex items-center justify-center px-8 py-4 bg-black text-white text-lg font-medium rounded-lg shadow-md transition-colors group"
                >
                  <span className="relative block overflow-hidden">
                    <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                      <span className="block">Schedule a Call</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                      Schedule a Call
                    </span>
                  </span>
                </Link>
              </div>
            </div>
          ) : (
            // ❌ Not Onboarded State
            <div className="card bg-[url('/assets/Main-bg.png')] bg-cover bg-center bg-no-repeat">
              <div className="text-center mb-8">
                
                <p className="text-lg font-semibold text-gray-900 mb-2">
                  {tierLabel}
                </p>
                <p className="text-base text-gray-900">
                  {tierMessage}
                </p>
              </div>

              {/* Rating Display */}
              <div className={`rounded-xl p-6 mb-8 text-center border ${tierBgClass}`}>
                <p className="text-sm text-gray-600 mb-2">Your Rating</p>
                <div className="text-5xl font-bold text-gray-900 mb-2">
                  {result.rating.toFixed(1)}
                  <span className="text-xl text-gray-500">/10</span>
                </div>
                <div className="flex justify-center items-center space-x-1 mt-4">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className={`w-3 h-3 rounded-full ${
                        i < Math.round(result.rating)
                          ? 'bg-black'
                          : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                {/* Graph / Score Bar */}
                <ScoreBar score={result.rating} />
              </div>

              {/* Analysis Summary + Suggestions */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Analysis Summary
                </h2>
                <p className="text-gray-900 leading-relaxed mb-4">
                  {result.analysisSummary}
                </p>
                {result.suggestions && result.suggestions.length > 0 && (
                  <div className="mt-4">
                    <h3 className="font-semibold text-gray-900 mb-2">
                      Suggestions for Improvement:
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-900">
                      {result.suggestions.map((suggestion, idx) => (
                        <li key={idx}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Email Notification Message */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  
                  <p className="text-sm text-blue-800">
                    We&apos;ve saved your details. A detailed analysis report has been sent to your email.
                  </p>
                </div>
              </div>

              <div className="flex flex-col justify-evenly sm:flex-row gap-4">
                <Link
                  to="/"
                  className="inline-flex items-center justify-center px-8 py-4 bg-black text-white text-lg font-medium rounded-lg shadow-md transition-colors group"
                >
                  <span className="relative block overflow-hidden">
                    <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                      <span className="block">Back to Home</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                      Back to Home
                    </span>
                  </span>
                </Link>
                <Link
                  to="https://www.skopekitchens.com/schedule-a-call"
                  className="inline-flex items-center justify-center px-8 py-4 bg-black text-white text-lg font-medium rounded-lg shadow-md transition-colors group"
                >
                  <span className="relative block overflow-hidden">
                    <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                      <span className="block">Schedule a Call</span>
                    </span>
                    <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                      Schedule a Call
                    </span>
                  </span>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

export default Result
