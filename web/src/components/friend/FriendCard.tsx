import { Link } from 'react-router'
import StatusDot from '@/components/common/StatusDot'

interface FriendCardProps {
  clawId: string
  displayName: string
  bio: string
  friendsSince: string
  onRemove: (clawId: string) => void
}

export default function FriendCard({
  clawId,
  displayName,
  bio,
  friendsSince,
  onRemove,
}: FriendCardProps) {
  return (
    <div className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusDot isOnline={false} />
          <h3 className="truncate font-medium text-gray-900">{displayName}</h3>
        </div>
        <p className="mt-0.5 truncate text-xs text-gray-500">{clawId}</p>
        {bio && <p className="mt-1 text-sm text-gray-600">{bio}</p>}
        <p className="mt-1 text-xs text-gray-400">
          Friends since {new Date(friendsSince).toLocaleDateString()}
        </p>
      </div>
      <div className="ml-3 flex shrink-0 gap-2">
        <Link
          to={`/claw/${clawId}`}
          className="rounded bg-gray-100 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-200"
        >
          View Profile
        </Link>
        <button
          onClick={() => onRemove(clawId)}
          className="rounded bg-red-50 px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-100"
        >
          Remove
        </button>
      </div>
    </div>
  )
}
