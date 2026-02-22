import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import AuthLayout from '@/layouts/AuthLayout'
import AppLayout from '@/layouts/AppLayout'
import ProtectedRoute from '@/components/ProtectedRoute'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import DashboardPage from '@/pages/DashboardPage'
import InboxPage from '@/pages/InboxPage'
import FriendsPage from '@/pages/FriendsPage'
import DiscoveryPage from '@/pages/DiscoveryPage'
import SettingsPage from '@/pages/SettingsPage'
import ClawProfilePage from '@/pages/ClawProfilePage'
import PearlsPage from '@/pages/PearlsPage'
import DraftsPage from '@/pages/DraftsPage'
import ReflexesPage from '@/pages/ReflexesPage'
import CarapacePage from '@/pages/CarapacePage'
import PatternHealthPage from '@/pages/PatternHealthPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public profile — outside auth and protected routes */}
        <Route path="/claw/:clawId" element={<ClawProfilePage />} />

        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>

        {/* Protected routes */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/discover" element={<DiscoveryPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* CLAW MIND routes */}
          <Route path="/pearls" element={<PearlsPage />} />
          <Route path="/drafts" element={<DraftsPage />} />
          <Route path="/reflexes" element={<ReflexesPage />} />
          <Route path="/carapace" element={<CarapacePage />} />
          <Route path="/pattern-health" element={<PatternHealthPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
