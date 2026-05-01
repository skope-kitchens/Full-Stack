import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authUtils } from '../utils/auth'

const Navigation = () => {
  const navigate = useNavigate()
  const [userInitials, setUserInitials] = useState('')
  const [isAuthed, setIsAuthed] = useState(false)

useEffect(() => {
  const authed = authUtils.isAuthenticated();
  setIsAuthed(authed);

  if (!authed) {
    setUserInitials("");
    return;
  }

  const storedType = localStorage.getItem("userType");

  if (storedType === "admin") {
    setUserInitials("AD");
    return;
  }

  const user = authUtils.getUser();
  if (!user) return;

  const nameSource =
    user.name || user.companyName || user.email || "";

  const parts = nameSource.trim().split(/\s+/);
  const initials =
    parts.length === 1
      ? parts[0].charAt(0)
      : `${parts[0].charAt(0)}${parts[1].charAt(0)}`;

  setUserInitials(initials.toUpperCase());
}, []);



const handleAvatarClick = () => {
  const user = authUtils.getUser();
  const storedType =
    localStorage.getItem("userType") ||
    user?.role ||
    user?.userType ||
    "";

  if (storedType === "vendor") {
    navigate("/vendor-dashboard");
  } else if (storedType === "client") {
    navigate("/dashboard");
  } else {
    navigate("/admin-dashboard");
  }
};



  return (
    <nav className="bg-white shadow-sm border-b w-9/12 mx-auto mt-4 rounded-full border-gray-100">
      <div className="max-w-7xl mx-auto  sm:px-8 lg:px-4">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="flex flex-col">
              <img src='/assets/Logo-Dark.png' className="w-[180px]" alt="" />
            </div>
          </Link>

          <div className="flex items-center space-x-6">
            <Link
              to="/"
              className="text-sm text-gray-900 hover:text-gray-900 transition-colors"
            >
              Home
            </Link>
          <Link
              to="/shop"
              className="text-sm text-gray-900 hover:text-gray-900 transition-colors"
            >
              Shop
            </Link>
            <Link
              to="/contact-us"
              className="text-sm text-gray-900 hover:text-gray-900 transition-colors"
            >
              Schedule Call
            </Link>

            {!isAuthed && (
              <>
            <Link
              to="/login"
              className="text-sm text-gray-900 hover:text-gray-900 transition-colors"
            >
              Login
            </Link>
            <Link 
              to="/signup" 
              className="px-4 py-2 text-sm font-medium text-gray-900 bg-white  rounded-lg hover:bg-gray-50 transition-colors shadow-lg"
            >
              Signup
            </Link>
              </>
            )}

            {isAuthed && (
            <div className="flex">
              {/* Hide cart for admin */}
              {localStorage.getItem("userType") !== "admin" && (
                <Link
                  to="/cart"
                  className="px-4 py-2 mr-10 text-sm font-medium text-gray-900 bg-white flex justify-center items-center rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cart
                </Link>
              )}

              <button
                type="button"
                onClick={handleAvatarClick}
                className="flex items-center gap-2 rounded-full bg-gray-900 text-white px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-gray-800 transition-colors"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-sm font-semibold">
                  {userInitials || "AD"}
                </span>
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            </div>
          )}

          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navigation

