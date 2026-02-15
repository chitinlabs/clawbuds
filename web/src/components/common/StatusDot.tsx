export default function StatusDot({ isOnline }: { isOnline: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full ${
        isOnline ? 'bg-green-500' : 'bg-gray-300'
      }`}
      title={isOnline ? 'Online' : 'Offline'}
    />
  )
}
