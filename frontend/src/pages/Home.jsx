import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { authUtils } from '../utils/auth'


const Home = () => {
  const navigate = useNavigate()

  const handleBecomePartner = (e) => {
  e.preventDefault()

  if (!authUtils.isAuthenticated()) {
    navigate('/login')
    return
  }

  const user = authUtils.getUser()

  // vendor detection
  const isVendor = !!user?.supplierName || !!user?.storeName

  if (isVendor) {
    navigate('/vendor-eligibility')
  } else {
    navigate('/eligibility-form')
  }
}



  return (
    <Layout>
      {/* Hero Section */}
      <section  className=" bg-cover bg-center bg-[url('/assets/Main-bg.png')] shadow-lg bg-no-repeat w-10/12 mx-auto mt-20 mb-20 py-24 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Skope Kitchen OS
          </h1>
          <p className="text-lg md:text-xl text-gray-900 mb-12 max-w-2xl mx-auto leading-relaxed">
            Partner with us to deliver high-quality food experiences to customers nationwide.
            Join our network of trusted vendors and grow your business.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleBecomePartner}
            className="inline-flex items-center justify-center px-8 py-4 bg-black text-white text-lg font-medium rounded-lg shadow-md transition-colors group"
          >
            <span className="relative block overflow-hidden">
              <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                <span className="block">Become a Partner</span>
              </span>
              <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                Become a Partner
              </span>
            </span>
          </button>



          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center px-8 py-4 bg-black text-white text-lg font-medium rounded-lg shadow-md transition-colors group"
          >
            <span className="relative block overflow-hidden">
              <span className="block transition-transform duration-300 group-hover:-translate-y-full">
                <span className="block">Partner's Login</span>
              </span>
              <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-300 group-hover:translate-y-0">
                Partner's Login
              </span>
            </span>
          </button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-16">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className=" bg-cover bg-[url('/assets/Main-bg.png')] bg-center bg-no-repeat rounded-xl p-8 text-center shadow-md">
              <div className="w-16 h-16 bg-gray-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Sign Up</h3>
              <p className="text-gray-900 leading-relaxed">
                Create your vendor account with basic company information.
              </p>
            </div>
            
            <div  className="  bg-cover bg-[url('/assets/Main-bg.png')] bg-center bg-no-repeat rounded-xl p-8 text-center shadow-md">
              <div className="w-16 h-16 bg-gray-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Submit Eligibility Form</h3>
              <p className="text-gray-900 leading-relaxed">
                Fill out detailed information about your operations and compliance.
              </p>
            </div>
            
            <div className="  bg-cover bg-[url('/assets/Main-bg.png')] bg-center bg-no-repeat rounded-xl p-8 text-center shadow-md">
              <div className="w-16 h-16 bg-gray-900 text-white rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Get Rated & Onboarded</h3>
              <p className="text-gray-900 leading-relaxed">
                Our AI evaluates your profile and you'll receive instant feedback.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      
    </Layout>
  )
}

export default Home

