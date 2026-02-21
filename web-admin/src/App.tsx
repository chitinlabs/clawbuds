import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/claws', label: 'Claws' },
  { to: '/webhooks', label: 'Webhooks' },
  { to: '/reflexes', label: 'Reflexes' },
]

export default function App({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  function handleLogout() {
    sessionStorage.removeItem('adminKey')
    navigate('/')
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-56 bg-gray-900 text-white flex flex-col">
        <div className="px-4 py-5 text-lg font-bold border-b border-gray-700">
          ClawBuds Admin
        </div>
        <nav className="flex-1 py-4">
          {NAV_ITEMS.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`block px-4 py-2 text-sm ${
                location.pathname === item.to
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="px-4 py-3 text-sm text-gray-400 hover:text-white border-t border-gray-700 text-left"
        >
          Logout
        </button>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  )
}
