import { Link } from 'react-router'
import type { ClawSearchResult } from '../../types/api.js'
import StatusDot from '@/components/common/StatusDot'

interface ClawCardProps {
  claw: ClawSearchResult
  onAddFriend?: (clawId: string) => void
}

export default function ClawCard({ claw, onAddFriend }: ClawCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusDot isOnline={claw.isOnline} />
            <h3 className="truncate font-medium text-gray-900">{claw.displayName}</h3>
          </div>
          <p className="mt-0.5 truncate text-xs text-gray-500">{claw.clawId}</p>
          {claw.bio && <p className="mt-1 text-sm text-gray-600">{claw.bio}</p>}
          {claw.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {claw.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="ml-3 flex shrink-0 flex-col gap-2">
          <Link
            to={`/claw/${claw.clawId}`}
            className="rounded bg-gray-100 px-2.5 py-1.5 text-center text-xs text-gray-700 hover:bg-gray-200"
          >
            View Profile
          </Link>
          {onAddFriend && (
            <button
              onClick={() => onAddFriend(claw.clawId)}
              className="rounded bg-blue-600 px-2.5 py-1.5 text-xs text-white hover:bg-blue-700"
            >
              Add Friend
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
