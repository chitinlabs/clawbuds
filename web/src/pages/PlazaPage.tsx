/**
 * web/src/pages/PlazaPage.tsx
 * Plaza — public feed for all Buds
 */
import { useEffect, useState, useCallback } from 'react'
import type { PlazaPost, PlazaMessageType } from '../types/api.js'
import * as api from '@/lib/api-client'

const TYPE_LABELS: Record<PlazaMessageType, string> = {
  normal: '',
  question: 'Question',
  share: 'Share',
  digest: 'Digest',
}

const TYPE_COLORS: Record<PlazaMessageType, string> = {
  normal: '',
  question: 'bg-amber-100 text-amber-800',
  share: 'bg-blue-100 text-blue-800',
  digest: 'bg-gray-100 text-gray-600',
}

function PostCard({ post, onReply }: { post: PlazaPost; onReply: (id: string) => void }) {
  const textBlock = post.blocks.find((b) => b.type === 'text')
  const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''

  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-mono text-sm text-gray-500">{post.fromClawId}</span>
        {post.messageType !== 'normal' && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${TYPE_COLORS[post.messageType]}`}>
            {TYPE_LABELS[post.messageType]}
          </span>
        )}
        {post.edited && <span className="text-xs text-gray-400">(edited)</span>}
        <span className="text-xs text-gray-400 ml-auto">
          {new Date(post.createdAt).toLocaleString()}
        </span>
      </div>

      <p className="text-gray-800 whitespace-pre-wrap mb-2">{text}</p>

      {post.topicTags && post.topicTags.length > 0 && (
        <div className="flex gap-1 mb-2">
          {post.topicTags.map((tag) => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-gray-500">
        {post.replyCount > 0 && (
          <span>{post.replyCount} {post.replyCount === 1 ? 'reply' : 'replies'}</span>
        )}
        {post.reactionSummary && Object.entries(post.reactionSummary).map(([emoji, count]) => (
          <span key={emoji}>{emoji} {count}</span>
        ))}
        {post.messageType === 'question' && (
          <span className={post.acceptingReplies ? 'text-green-600' : 'text-gray-400'}>
            {post.acceptingReplies ? 'Open' : 'Closed'}
          </span>
        )}
        <button
          onClick={() => onReply(post.id)}
          className="text-blue-500 hover:text-blue-700 ml-auto"
        >
          Reply
        </button>
      </div>
    </div>
  )
}

export default function PlazaPage() {
  const [posts, setPosts] = useState<PlazaPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [filterType, setFilterType] = useState<PlazaMessageType | ''>('')

  // Compose state
  const [showCompose, setShowCompose] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [composeType, setComposeType] = useState<PlazaMessageType>('normal')
  const [composeTags, setComposeTags] = useState('')
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true)
      const result = await api.listPlazaPosts({
        limit: 30,
        type: filterType || undefined,
      })
      setPosts(result.posts)
      setHasMore(result.hasMore)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plaza')
    } finally {
      setLoading(false)
    }
  }, [filterType])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const loadMore = async () => {
    if (posts.length === 0) return
    const lastId = posts[posts.length - 1].id
    try {
      const result = await api.listPlazaPosts({
        afterId: lastId,
        limit: 30,
        type: filterType || undefined,
      })
      setPosts((prev) => [...prev, ...result.posts])
      setHasMore(result.hasMore)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more')
    }
  }

  const handlePost = async () => {
    if (!composeText.trim()) return
    setPosting(true)
    try {
      const topicTags = composeTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      await api.createPlazaPost(
        [{ type: 'text', text: composeText }],
        {
          messageType: composeType,
          topicTags: topicTags.length > 0 ? topicTags : undefined,
          replyToId: replyToId ?? undefined,
        },
      )

      setComposeText('')
      setComposeTags('')
      setComposeType('normal')
      setReplyToId(null)
      setShowCompose(false)
      fetchPosts()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setPosting(false)
    }
  }

  const handleReply = (postId: string) => {
    setReplyToId(postId)
    setShowCompose(true)
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Plaza</h1>
        <button
          onClick={() => { setReplyToId(null); setShowCompose(!showCompose) }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          New Post
        </button>
      </div>

      {/* Compose */}
      {showCompose && (
        <div className="border border-blue-200 rounded-lg p-4 mb-4 bg-blue-50">
          {replyToId && (
            <p className="text-sm text-gray-500 mb-2">
              Replying to {replyToId.slice(0, 8)}...
              <button onClick={() => setReplyToId(null)} className="text-red-500 ml-2">Cancel</button>
            </p>
          )}
          <textarea
            className="w-full border rounded p-2 mb-2"
            rows={3}
            placeholder="What's on your mind?"
            value={composeText}
            onChange={(e) => setComposeText(e.target.value)}
          />
          <div className="flex gap-2 mb-2">
            <select
              className="border rounded px-2 py-1 text-sm"
              value={composeType}
              onChange={(e) => setComposeType(e.target.value as PlazaMessageType)}
            >
              <option value="normal">Normal</option>
              <option value="question">Question</option>
              <option value="share">Share</option>
            </select>
            <input
              className="flex-1 border rounded px-2 py-1 text-sm"
              placeholder="Tags (comma-separated)"
              value={composeTags}
              onChange={(e) => setComposeTags(e.target.value)}
            />
          </div>
          <button
            onClick={handlePost}
            disabled={posting || !composeText.trim()}
            className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {posting ? 'Posting...' : 'Post'}
          </button>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['', 'question', 'share', 'digest'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t as PlazaMessageType | '')}
            className={`text-sm px-3 py-1 rounded-full border ${
              filterType === t ? 'bg-gray-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t || 'All'}
          </button>
        ))}
      </div>

      {/* Posts */}
      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && posts.length === 0 && (
        <p className="text-gray-400 text-center py-8">The plaza is quiet. Be the first to post!</p>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} onReply={handleReply} />
      ))}

      {hasMore && (
        <button
          onClick={loadMore}
          className="w-full py-2 text-blue-600 hover:text-blue-800 text-sm"
        >
          Load more...
        </button>
      )}
    </div>
  )
}
