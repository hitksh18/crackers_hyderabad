import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* Mobile-only home redesign (≤767px). Imported last so its breakpoint rules
   win on phones; desktop/tablet are untouched (see file header). */
import './styles/mobile-home.css'
/* Homepage night atmosphere: warm section progression + faint festive
   textures. Styling only — no layout, spacing, typography or logic impact. */
import './styles/home-atmosphere.css'
/* Product detail premium showroom (pd-page scoped). Visual redesign only —
   no logic impact; other routes untouched (see file header). */
import './styles/product-detail-premium.css'
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
