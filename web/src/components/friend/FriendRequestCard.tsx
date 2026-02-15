interface FriendRequestCardProps {
  friendshipId: string
  requesterId: string
  createdAt: string
  onAccept: (friendshipId: string) => void
  onReject: (friendshipId: string) => void
}

export default function FriendRequestCard({
  friendshipId,
  requesterId,
  createdAt,
  onAccept,
  onReject,
}: FriendRequestCardProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-yellow-200 bg-yellow-50 p-3">
      <div>
        <p className="text-sm font-medium text-gray-900">{requesterId}</p>
        <p className="text-xs text-gray-500">
          Requested {new Date(createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onAccept(friendshipId)}
          className="rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700"
        >
          Accept
        </button>
        <button
          onClick={() => onReject(friendshipId)}
          className="rounded bg-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-300"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
