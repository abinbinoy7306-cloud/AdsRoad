import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/globals.css'
import { AuthProvider } from './contexts/AuthContext'
import { supabaseUrl } from './services/supabaseClient'
import { fetchActiveSubscriptionList } from './utils/subscriptionCatalog'

const warmUpAds = () => {
  void fetchActiveSubscriptionList().catch(() => {})
}

const preconnectOrigins = [
  'https://checkout.razorpay.com',
  'https://api.razorpay.com',
  'https://lumberjack.razorpay.com',
]

function ensurePreconnect(href) {
  if (!href || typeof document === 'undefined') return;

  const selector = `link[rel="preconnect"][href="${href}"]`;
  if (document.querySelector(selector)) return;

  const link = document.createElement('link')
  link.rel = 'preconnect'
  link.href = href
  link.crossOrigin = 'anonymous'
  document.head.appendChild(link)
}

for (const origin of preconnectOrigins) {
  ensurePreconnect(origin)
}

if (typeof window !== 'undefined') {
  const scheduleWarmup = window.requestIdleCallback
    ? (callback) => window.requestIdleCallback(callback, { timeout: 2000 })
    : (callback) => window.setTimeout(callback, 0)

  scheduleWarmup(warmUpAds)
}

try {
  const origin = new URL(supabaseUrl).origin
  if (!document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) {
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = origin
    link.crossOrigin = 'anonymous'
    document.head.appendChild(link)
  }
} catch {
  // Ignore invalid Supabase URL during local setup.
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
