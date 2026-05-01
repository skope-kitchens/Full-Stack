import Footer from './Footer'
import Navigation from './Navigation'

const Layout = ({ children, showNav = true }) => {
  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      {showNav && <Navigation />}
      <main>{children}</main>
      {<Footer />}
    </div>
  )
}

export default Layout

