import ProfileSection from '@/components/settings/ProfileSection'
import AutonomySection from '@/components/settings/AutonomySection'
import KeySection from '@/components/settings/KeySection'
import WebhookSection from '@/components/settings/WebhookSection'
import DangerZone from '@/components/settings/DangerZone'

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <ProfileSection />
      <hr className="border-gray-200" />
      <AutonomySection />
      <hr className="border-gray-200" />
      <KeySection />
      <hr className="border-gray-200" />
      <WebhookSection />
      <hr className="border-gray-200" />
      <DangerZone />
    </div>
  )
}
