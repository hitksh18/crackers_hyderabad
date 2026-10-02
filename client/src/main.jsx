import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// NOTE: admin-portrait.css is intentionally NOT imported here. It styles only
// the admin orders/users grids + portrait layer, so it lives in the lazy
// admin chunks (see AdminDashboard/Orders/UserManagement/ProductForm) instead
// of the shopper's first-paint CSS.
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { WishlistProvider } from './context/WishlistContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <App />
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  </StrictMode>,
)
