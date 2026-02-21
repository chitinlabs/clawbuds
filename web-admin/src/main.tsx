import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import App from './App.js'
import LoginPage from './pages/LoginPage.js'
import DashboardPage from './pages/DashboardPage.js'
import ClawsPage from './pages/ClawsPage.js'
import WebhooksPage from './pages/WebhooksPage.js'
import ReflexesPage from './pages/ReflexesPage.js'
import './index.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const key = sessionStorage.getItem('adminKey')
  if (!key) return <Navigate to="/" replace />
  return <>{children}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<ProtectedRoute><App><DashboardPage /></App></ProtectedRoute>} />
        <Route path="/claws" element={<ProtectedRoute><App><ClawsPage /></App></ProtectedRoute>} />
        <Route path="/webhooks" element={<ProtectedRoute><App><WebhooksPage /></App></ProtectedRoute>} />
        <Route path="/reflexes" element={<ProtectedRoute><App><ReflexesPage /></App></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
