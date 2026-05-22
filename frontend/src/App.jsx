import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import ToastContainer from './components/ToastContainer'
import Home from './pages/Home'
import Login from './pages/Login'
import { SignUp } from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import EligibilityForm from './pages/EligibilityForm'
import Analyzing from './pages/Analyzing'
import Result from './pages/Result'
import ContactUs from './pages/ContactUs'
import Dashboard from './pages/Dashboard'
import Shop from './pages/Shop'
import Product from './pages/Product'
import Cart from './pages/Cart'
import Category from './pages/Category'
import ScrollToTop from './components/ScrollToTop'
import ProductUpload from './pages/ProductUpload'
import VendorDashboard from './pages/VendorDashboard'
import OrderDish from './pages/OrderDish'
import VendorEligibility from './pages/VendorEligibility'
import AdminDashboard from './pages/AdminDashboard'
import AddRecipe from './pages/AddRecipe'
import ClientInventory from "./pages/ClientInventory";
import AddTrialRecipe from "./pages/AddTrialRecipe";
import AddTrainingRecipe from "./pages/AddTrainingRecipe";
import GoogleSuccess from "./pages/GoogleSuccess";
import ProjectionForm from "./pages/ProjectionForm";
import ProjectionReview from "./pages/admin/ProjectionReview";
function App() {
  return (
    <Router
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ToastContainer />
      <ScrollToTop />
      <Routes>
        
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/eligibility-form" element={<EligibilityForm />} />
        <Route path="/analyzing" element={<Analyzing />} />
        <Route path="/result" element={<Result />} />
        <Route path="/contact-us" element={<ContactUs />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vendor-dashboard" element={<VendorDashboard />} />
        <Route path="/shop" element={<Shop />} />
        <Route path="/product/:itemName" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/category/:categoryName" element={<Category />}/>
        <Route path="/product-upload" element={<ProductUpload />}/>
        <Route path="/order" element={<OrderDish />}/>
        <Route path="/vendor-eligibility" element={<VendorEligibility />}/>
        <Route path="/admin-dashboard" element={<AdminDashboard />}/>
        <Route path="/add-recipe" element={<AddRecipe />}/>
        <Route path="/add-trial-recipe" element={<AddTrialRecipe />}/>
        <Route path="/add-training-recipe" element={<AddTrainingRecipe />}/>
        <Route path="/client-inventory" element={<ClientInventory />}/>
        <Route path="/google-success" element={<GoogleSuccess />}/>
        <Route path="/projection" element={<ProjectionForm />}/>
        <Route path="/admin/projection/:brandId" element={<ProjectionReview />}/>
      </Routes>
    </Router>
  )
}

export default App


