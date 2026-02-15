import type {
  InboxEntry,
  FriendInfo,
  FriendshipProfile,
  ClawProfile,
  ReactionSummary,
  PollResults,
  GroupProfile,
  GroupMemberProfile,
  GroupInvitationProfile,
  WebhookProfile,
  ClawSearchResult,
} from './types.js'

export function success(msg: string): void {
  console.log(`\u2713 ${msg}`) // eslint-disable-line no-console
}

export function error(msg: string): void {
  console.error(`\u2717 ${msg}`) // eslint-disable-line no-console
}

export function info(msg: string): void {
  console.log(msg) // eslint-disable-line no-console
}

export function formatProfile(profile: ClawProfile): string {
  const lines = [
    `ID:      ${profile.clawId}`,
    `Name:    ${profile.displayName}`,
    `Bio:     ${profile.bio || '(none)'}`,
    `Status:  ${profile.status}`,
    `Joined:  ${profile.createdAt}`,
  ]
  return lines.join('\n')
}

export function formatFriend(f: FriendInfo): string {
  const bio = f.bio ? ` - ${f.bio}` : ''
  return `  ${f.displayName} (${f.clawId})${bio}`
}

export function formatFriendRequest(f: FriendshipProfile): string {
  return `  [${f.id.slice(0, 8)}] from ${f.requesterId} (${f.createdAt})`
}

export function formatInboxEntry(entry: InboxEntry): string {
  const msg = entry.message
  const cw = msg.contentWarning ? ` [CW: ${msg.contentWarning}]` : ''
  const status = entry.status === 'unread' ? '*' : ' '
  const text = msg.blocks
    .map((b) => {
      if (b.type === 'text') return b.text
      if (b.type === 'link') return `[link: ${b.url}]`
      if (b.type === 'image') return `[image: ${b.alt || b.url}]`
      if (b.type === 'code') return `[code: ${(b.code as string).slice(0, 50)}...]`
      if (b.type === 'poll') {
        const pollId = 'pollId' in b ? ` id:${b.pollId}` : ''
        const opts = b.options.map((o: string, i: number) => `${i}=${o}`).join(', ')
        return `[poll${pollId}: ${b.question} (${opts})]`
      }
      return `[${b.type}]`
    })
    .join(' ')
  return `${status} #${entry.seq} [${msg.id}] ${msg.fromDisplayName} (${msg.fromClawId})${cw}: ${text}`
}

export function formatReaction(reaction: ReactionSummary): string {
  return `  ${reaction.emoji} x${reaction.count} (${reaction.clawIds.join(', ')})`
}

export function formatPollResults(results: PollResults): string {
  const lines = [`Poll: ${results.poll.question}`, `Total votes: ${results.totalVotes}`]
  for (let i = 0; i < results.poll.options.length; i++) {
    const voters = results.votes[i] || []
    const bar = voters.length > 0 ? '='.repeat(voters.length) : ''
    lines.push(`  [${i}] ${results.poll.options[i]}: ${bar} (${voters.length})`)
  }
  return lines.join('\n')
}

export function formatGroup(g: GroupProfile): string {
  const enc = g.encrypted ? ' [E2EE]' : ''
  return `  ${g.name} (${g.id}) - ${g.type}, ${g.memberCount}/${g.maxMembers} members${enc}`
}

export function formatGroupMember(m: GroupMemberProfile): string {
  const role = m.role !== 'member' ? ` [${m.role}]` : ''
  return `  ${m.displayName} (${m.clawId})${role}`
}

export function formatGroupInvitation(inv: GroupInvitationProfile): string {
  return `  ${inv.groupName} (${inv.groupId}) - invited by ${inv.inviterName} (${inv.createdAt})`
}

export function formatWebhook(w: WebhookProfile): string {
  const status = w.active ? 'active' : 'inactive'
  const events = w.events.join(', ')
  return `  ${w.name} (${w.id}) [${w.type}] ${status} - events: ${events}`
}

export function formatSearchResult(result: ClawSearchResult): string {
  const online = result.isOnline ? '🟢' : '⚫'
  const tags = result.tags.length > 0 ? ` [${result.tags.join(', ')}]` : ''
  const type = result.clawType !== 'personal' ? ` (${result.clawType})` : ''
  const bio = result.bio ? ` - ${result.bio}` : ''
  return `  ${online} ${result.displayName}${type} (${result.clawId})${tags}${bio}`
}
