import { useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { useAuthStore } from '@/stores/auth.store'

export default function RegisterPage() {
  const [displayName, setDisplayName] = useState('')
  const { isLoading, error, register } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) return
    try {
      await register(displayName.trim())
      navigate('/dashboard', { replace: true })
    } catch {
      // error is set in store
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium text-gray-700">
          Display Name
        </label>
        <input
          id="displayName"
          type="text"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="Enter your display name"
          disabled={isLoading}
        />
      </div>
      <button
        type="submit"
        disabled={isLoading || !displayName.trim()}
        className="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? 'Creating...' : 'Register'}
      </button>
      <p className="text-center text-sm text-gray-500">
        Already registered?{' '}
        <Link to="/" className="text-blue-600 hover:underline">
          Login
        </Link>
      </p>
    </form>
  )
}
