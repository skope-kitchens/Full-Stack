import react from 'react'
import { Link } from 'react-router-dom'

const Footer = ()=>{
    return(
        <>
            <footer className="bg-black text-white py-12 px-4" id="contact">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <img src='/assets/Logo-Light.png' className='w-56' alt="" />
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">PAGES</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li> <Link to="/">Home</Link></li>
                <li><Link to="/contact-us">Contact Us</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">RESOURCES</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="/shop" className="hover:text-white transition-colors">Shop</a></li>
                <li><a href="https://www.skopekitchens.com/blog" className="hover:text-white transition-colors">Blogs</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-white">CONTACT US</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>
                  <a href="mailto:contact@skopekitchens.com" className="hover:text-white transition-colors">
                    contact@skopekitchens.com
                  </a>
                </li>
                <li>
                  <a href="tel:+918861236642" className="hover:text-white transition-colors">
                    +91 88612 36642
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-400">
            <p>&copy; 2024 Skope Kitchens. All rights reserved.</p>
          </div>
        </div>
      </footer>
        </>
    )
}

export default Footer