import { NavLink, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth.store'
import MobileNav from '@/components/layout/MobileNav'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/friends', label: 'Friends' },
  { to: '/discover', label: 'Discover' },
  { to: '/settings', label: 'Settings' },
]

export default function AppLayout() {
  const { displayName, clawId, logout } = useAuthStore()

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden w-56 flex-col bg-gray-900 text-white md:flex">
        <div className="p-4">
          <h2 className="text-lg font-bold">ClawBuds</h2>
          <p className="mt-1 truncate text-xs text-gray-400">{displayName}</p>
          <p className="truncate text-xs text-gray-500">{clawId}</p>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded px-3 py-2 text-sm ${
                  isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4">
          <button
            onClick={logout}
            className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-600"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6 pb-24 md:pb-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />
    </div>
  )
}
