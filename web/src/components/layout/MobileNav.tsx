import { NavLink } from 'react-router'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/inbox', label: 'Inbox' },
  { to: '/friends', label: 'Friends' },
  { to: '/discover', label: 'Discover' },
  { to: '/settings', label: 'Settings' },
]

export default function MobileNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-gray-200 bg-white md:hidden">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center py-2 text-xs ${
              isActive ? 'text-blue-600' : 'text-gray-500'
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
