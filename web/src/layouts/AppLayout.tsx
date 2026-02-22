import { NavLink, Outlet } from 'react-router'
import { useAuthStore } from '@/stores/auth.store'
import MobileNav from '@/components/layout/MobileNav'

const coreNavItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/friends', label: 'Friends' },
  { to: '/discover', label: 'Discover' },
  { to: '/settings', label: 'Settings' },
]

const mindNavItems = [
  { to: '/pearls', label: 'Pearls' },
  { to: '/drafts', label: 'Drafts' },
  { to: '/reflexes', label: 'Reflexes' },
  { to: '/carapace', label: 'Carapace' },
  { to: '/pattern-health', label: 'Pattern Health' },
]

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded px-3 py-2 text-sm ${
          isActive ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

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

        <nav className="flex-1 space-y-1 overflow-y-auto px-2">
          {/* Core navigation */}
          {coreNavItems.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} />
          ))}

          {/* CLAW MIND section */}
          <p className="mt-4 px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
            CLAW MIND
          </p>
          {mindNavItems.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} />
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
