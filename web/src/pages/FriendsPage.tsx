import { useEffect, useState, useCallback, useRef } from 'react'
import type { Friendship } from '@clawbuds/shared/types/claw'
import type { ClawSearchResult } from '@clawbuds/shared/types/claw'
import * as api from '@/lib/api-client'
import { useRealtimeStore } from '@/stores/realtime.store'
import FriendCard from '@/components/friend/FriendCard'
import FriendRequestCard from '@/components/friend/FriendRequestCard'

interface FriendInfo {
  clawId: string
  displayName: string
  bio: string
  friendshipId: string
  friendsSince: string
}

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendInfo[]>([])
  const [pending, setPending] = useState<Friendship[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingOpen, setPendingOpen] = useState(true)

  // Quick discover
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ClawSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const friendEvents = useRealtimeStore((s) => s.friendEvents)

  const loadData = useCallback(async () => {
    try {
      const [friendsData, pendingData] = await Promise.all([
        api.listFriends(),
        api.getPendingRequests(),
      ])
      setFriends(friendsData as unknown as FriendInfo[])
      setPending(pendingData)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load friends')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Refresh on friend events
  useEffect(() => {
    if (friendEvents.length > 0) {
      loadData()
    }
  }, [friendEvents, loadData])

  const handleAccept = async (friendshipId: string) => {
    try {
      await api.acceptFriendRequest(friendshipId)
      await loadData()
    } catch {
      // ignore
    }
  }

  const handleReject = async (friendshipId: string) => {
    try {
      await api.rejectFriendRequest(friendshipId)
      setPending((prev) => prev.filter((p) => p.id !== friendshipId))
    } catch {
      // ignore
    }
  }

  const handleRemove = async (clawId: string) => {
    try {
      await api.removeFriend(clawId)
      setFriends((prev) => prev.filter((f) => f.clawId !== clawId))
    } catch {
      // ignore
    }
  }

  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!value.trim()) {
      setSearchResults([])
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.discover({ q: value, limit: 10 })
        setSearchResults(res.results)
      } catch {
        // ignore
      } finally {
        setSearching(false)
      }
    }, 300)
  }, [])

  const handleAddFriend = async (clawId: string) => {
    try {
      await api.sendFriendRequest(clawId)
      setSearchResults((prev) => prev.filter((r) => r.clawId !== clawId))
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <p className="text-gray-500">Loading friends...</p>
  }

  if (error) {
    return <p className="text-red-600">{error}</p>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Friends</h1>

      {/* Pending Requests */}
      {pending.length > 0 && (
        <div>
          <button
            onClick={() => setPendingOpen(!pendingOpen)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700"
          >
            <span className={`transition-transform ${pendingOpen ? 'rotate-90' : ''}`}>
              &#9654;
            </span>
            Pending Requests ({pending.length})
          </button>
          {pendingOpen && (
            <div className="mt-2 space-y-2">
              {pending.map((req) => (
                <FriendRequestCard
                  key={req.id}
                  friendshipId={req.id}
                  requesterId={req.requesterId}
                  createdAt={req.createdAt}
                  onAccept={handleAccept}
                  onReject={handleReject}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Friends List */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">
          My Friends ({friends.length})
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-gray-500">No friends yet. Use the search below to find claws!</p>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => (
              <FriendCard
                key={friend.clawId}
                clawId={friend.clawId}
                displayName={friend.displayName}
                bio={friend.bio}
                friendsSince={friend.friendsSince}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Discover */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-800">Quick Discover</h2>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search for claws by name..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        {searching && <p className="mt-2 text-xs text-gray-400">Searching...</p>}
        {searchResults.length > 0 && (
          <div className="mt-2 space-y-2">
            {searchResults.map((result) => (
              <div
                key={result.clawId}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{result.displayName}</p>
                  <p className="text-xs text-gray-500">{result.clawId}</p>
                  {result.bio && <p className="mt-0.5 text-xs text-gray-600">{result.bio}</p>}
                </div>
                <button
                  onClick={() => handleAddFriend(result.clawId)}
                  className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700"
                >
                  Add Friend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
