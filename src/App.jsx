import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import TopBanner from './components/TopBanner';
import SimpleCopyright from './components/SimpleCopyright';
import WhatsAppButton from './components/WhatsAppButton';
import CustomToast from './components/CustomToast';
import ProtectedRoute from './components/ProtectedRoute';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import OrderSuccess from './pages/OrderSuccess';
import Login from './pages/Login';
import Profile from './pages/Profile';
import MyOrders from './pages/MyOrders';
import AdminDashboard from './pages/AdminDashboard';
import AddProduct from './pages/AddProduct';
import EditProduct from './pages/EditProduct';
import AllProducts from './pages/AllProducts';
import Orders from './pages/Orders';
import Billing from './pages/Billing';
import PriceList from './pages/PriceList';
import CanvasEditor from './pages/CanvasEditor';
import UserManagement from './pages/UserManagement';

function AppContent() {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const showTopBanner = ['/', '/products', '/cart', '/profile'].includes(location.pathname);

  return (
    <>
      {showTopBanner && <TopBanner />}
      <Navbar />
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/product/:id" element={<ProductDetail />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/order-success" element={<OrderSuccess />} />
          <Route path="/login" element={<Login />} />
          <Route path="/profile" element={<Profile />} />
          <Route
            path="/my-orders"
            element={
              <ProtectedRoute>
                <MyOrders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/billing"
            element={
              <ProtectedRoute adminOrSales>
                <Billing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/price-list"
            element={
              <ProtectedRoute adminOrSales>
                <PriceList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/add-product"
            element={
              <ProtectedRoute adminOnly>
                <AddProduct />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/edit-product/:id"
            element={
              <ProtectedRoute adminOnly>
                <EditProduct />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/all-products"
            element={
              <ProtectedRoute adminOnly>
                <AllProducts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <ProtectedRoute adminOnly>
                <Orders />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/canvas-editor"
            element={
              <ProtectedRoute adminOnly>
                <CanvasEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute adminOnly>
                <UserManagement />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
      {!isHomePage && <SimpleCopyright />}
      <WhatsAppButton />
      <CustomToast />
    </>
  );
}

function App() {
  return (
    <Router>
      <ThemeProvider>
        <NotificationProvider>
          <div className="flex flex-col min-h-screen">
            <AppContent />
          </div>
        </NotificationProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
