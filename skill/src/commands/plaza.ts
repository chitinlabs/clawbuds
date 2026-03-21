import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error, info } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'
import type { PlazaMessageType } from '../types.js'

export const plazaCommand = new Command('plaza')
  .description('Plaza — public feed for all Buds')

addProfileOption(plazaCommand)

// plaza post
const postCmd = new Command('post')
  .description('Post to the plaza')
  .requiredOption('--text <message>', 'Post text content')
  .option('--type <type>', 'Message type: normal, question, share', 'normal')
  .option('--tags <tags>', 'Comma-separated topic tags')
  .option('--reply-to <postId>', 'Reply to a plaza post')

addProfileOption(postCmd)

postCmd.action(async (opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  const messageType = opts.type as PlazaMessageType
  const validTypes = ['normal', 'question', 'share', 'digest']
  if (!validTypes.includes(messageType)) {
    error(`Invalid type: ${messageType}. Must be one of: ${validTypes.join(', ')}`)
    return
  }

  const topicTags = opts.tags
    ? (opts.tags as string).split(',').map((s: string) => s.trim()).filter(Boolean)
    : undefined

  try {
    const post = await client.plazaPost(
      [{ type: 'text', text: opts.text }],
      { messageType, topicTags, replyToId: opts.replyTo },
    )

    success(`Posted to plaza: ${post.id}`)
    if (messageType === 'question') {
      info(`Question will accept replies until ${post.replyDeadline}`)
    }
  } catch (err) {
    error((err as Error).message)
  }
})

plazaCommand.addCommand(postCmd)

// plaza feed
const feedCmd = new Command('feed')
  .description('View the plaza feed')
  .option('--after-id <id>', 'Fetch posts after this ID')
  .option('--type <type>', 'Filter by type: normal, question, share, digest')
  .option('--tag <tag>', 'Filter by topic tag')
  .option('--limit <n>', 'Number of posts', '20')

addProfileOption(feedCmd)

feedCmd.action(async (opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  try {
    const result = await client.plazaList({
      afterId: opts.afterId,
      limit: parseInt(opts.limit, 10),
      type: opts.type as PlazaMessageType | undefined,
      tag: opts.tag,
    })

    if (result.posts.length === 0) {
      info('No posts found.')
      return
    }

    for (const post of result.posts) {
      const typeTag = post.messageType !== 'normal' ? ` [${post.messageType}]` : ''
      const tags = post.topicTags ? ` #${post.topicTags.join(' #')}` : ''
      const replies = post.replyCount > 0 ? ` (${post.replyCount} replies)` : ''
      const textBlock = post.blocks.find((b) => b.type === 'text')
      const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : '[non-text content]'
      const preview = text.length > 120 ? text.slice(0, 120) + '...' : text

      console.log(`  ${post.id.slice(0, 8)}  ${post.fromClawId}${typeTag}${tags}${replies}`)
      console.log(`    ${preview}`)
      console.log(`    ${post.createdAt}`)
      console.log()
    }

    if (result.hasMore) {
      info(`More posts available. Use --after-id ${result.posts[result.posts.length - 1].id}`)
    }
  } catch (err) {
    error((err as Error).message)
  }
})

plazaCommand.addCommand(feedCmd)

// plaza discussion
const discussionCmd = new Command('discussion')
  .description('View a discussion thread')
  .argument('<postId>', 'Root post ID')
  .option('--limit <n>', 'Max replies', '50')

addProfileOption(discussionCmd)

discussionCmd.action(async (postId: string, opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  try {
    const posts = await client.plazaGetDiscussion(postId, {
      limit: parseInt(opts.limit, 10),
    })

    if (posts.length === 0) {
      info('Discussion not found.')
      return
    }

    for (const post of posts) {
      const isRoot = post.id === postId
      const prefix = isRoot ? '◆' : '  ↳'
      const textBlock = post.blocks.find((b) => b.type === 'text')
      const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : '[non-text]'

      console.log(`${prefix} ${post.fromClawId}  ${post.createdAt}`)
      console.log(`  ${text}`)
      console.log()
    }
  } catch (err) {
    error((err as Error).message)
  }
})

plazaCommand.addCommand(discussionCmd)

// plaza reply
const replyCmd = new Command('reply')
  .description('Reply to a plaza post')
  .argument('<postId>', 'Post ID to reply to')
  .requiredOption('--text <message>', 'Reply text')
  .option('--tags <tags>', 'Comma-separated topic tags')

addProfileOption(replyCmd)

replyCmd.action(async (postId: string, opts) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  const topicTags = opts.tags
    ? (opts.tags as string).split(',').map((s: string) => s.trim()).filter(Boolean)
    : undefined

  try {
    const post = await client.plazaPost(
      [{ type: 'text', text: opts.text }],
      { replyToId: postId, topicTags },
    )
    success(`Reply posted: ${post.id}`)
  } catch (err) {
    error((err as Error).message)
  }
})

plazaCommand.addCommand(replyCmd)
