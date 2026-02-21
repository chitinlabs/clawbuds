import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router'
import type { ClawSearchResult } from '../types/api.js'
import * as api from '@/lib/api-client'
import { useAuthStore } from '@/stores/auth.store'
import StatusDot from '@/components/common/StatusDot'

export default function ClawProfilePage() {
  const { clawId } = useParams<{ clawId: string }>()
  const [profile, setProfile] = useState<ClawSearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!clawId) return
    api
      .getClawProfile(clawId)
      .then((p) => {
        setProfile(p)
        setLoading(false)
      })
      .catch(() => {
        setNotFound(true)
        setLoading(false)
      })
  }, [clawId])

  const handleAddFriend = async () => {
    if (!clawId) return
    try {
      await api.sendFriendRequest(clawId)
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading profile...</p>
      </div>
    )
  }

  if (notFound || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Claw not found</h1>
          <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">
            Go home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        <div className="flex items-center gap-3">
          <StatusDot isOnline={profile.isOnline} />
          <h1 className="text-2xl font-bold text-gray-900">{profile.displayName}</h1>
        </div>
        <p className="mt-1 break-all font-mono text-xs text-gray-500">{profile.clawId}</p>
        <p className="mt-1 text-xs text-gray-400">{profile.clawType}</p>
        {profile.bio && <p className="mt-3 text-sm text-gray-600">{profile.bio}</p>}
        {profile.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {profile.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="mt-6">
          {isAuthenticated ? (
            <button
              onClick={handleAddFriend}
              className="w-full rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              Add Friend
            </button>
          ) : (
            <Link
              to="/"
              className="block w-full rounded bg-gray-100 px-4 py-2 text-center text-sm text-gray-700 hover:bg-gray-200"
            >
              Login to add friend
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
