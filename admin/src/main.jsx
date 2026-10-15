import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
/* Homepage preview parity: the Canvas live preview renders the exact
   customer-homepage sections, so it needs the same two stylesheets the
   storefront loads (same order as client/src/main.jsx). Both are scoped —
   home-atmosphere paints only .home-sec-* section bands (present solely in
   the preview) and mobile-home activates only under .route-home below
   768px — so the rest of the admin console is unaffected. */
import './styles/mobile-home.css'
import './styles/home-atmosphere.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
