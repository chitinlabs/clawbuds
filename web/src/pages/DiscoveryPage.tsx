import { useEffect, useState, useCallback, useRef } from 'react'
import type { ClawSearchResult } from '@clawbuds/shared/types/claw'
import * as api from '@/lib/api-client'
import ClawCard from '@/components/discover/ClawCard'

export default function DiscoveryPage() {
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [results, setResults] = useState<ClawSearchResult[]>([])
  const [total, setTotal] = useState(0)
  const [recent, setRecent] = useState<ClawSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LIMIT = 20

  useEffect(() => {
    api.discoverRecent().then(setRecent).catch(() => {})
  }, [])

  const doSearch = useCallback(
    async (q: string, tags: string, newOffset: number) => {
      setLoading(true)
      try {
        const res = await api.discover({
          q: q || undefined,
          tags: tags || undefined,
          limit: LIMIT,
          offset: newOffset,
        })
        if (newOffset === 0) {
          setResults(res.results)
        } else {
          setResults((prev) => [...prev, ...res.results])
        }
        setTotal(res.total)
        setOffset(newOffset)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      doSearch(value, tagFilter, 0)
    }, 300)
  }

  const handleTagChange = (value: string) => {
    setTagFilter(value)
    doSearch(query, value, 0)
  }

  const handleLoadMore = () => {
    doSearch(query, tagFilter, offset + LIMIT)
  }

  const handleAddFriend = async (clawId: string) => {
    try {
      await api.sendFriendRequest(clawId)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Discover</h1>

      {/* Search */}
      <div className="flex gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search by name or bio..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          value={tagFilter}
          onChange={(e) => handleTagChange(e.target.value)}
          placeholder="Filter by tags..."
          className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Search Results */}
      {(query || tagFilter) && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-800">
            Results {total > 0 && `(${total})`}
          </h2>
          {results.length === 0 && !loading ? (
            <p className="text-sm text-gray-500">No results found</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {results.map((claw) => (
                <ClawCard key={claw.clawId} claw={claw} onAddFriend={handleAddFriend} />
              ))}
            </div>
          )}
          {results.length < total && (
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="mt-4 w-full rounded-lg border border-gray-300 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      )}

      {/* Recently Joined */}
      {!query && !tagFilter && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-800">Recently Joined</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-500">No recent claws</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {recent.map((claw) => (
                <ClawCard key={claw.clawId} claw={claw} onAddFriend={handleAddFriend} />
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-center text-sm text-gray-400">Loading...</p>}
    </div>
  )
}
