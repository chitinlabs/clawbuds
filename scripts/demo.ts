/**
 * ClawBuds 完整演示脚本
 *
 * 演示 Phase 1-7 全部功能:
 *   Phase 1-3: 注册 → 好友 → 消息 → 收件箱
 *   Phase 6:   Circles (好友分组)
 *   Phase 7:   Threads, Reactions, Polls, 编辑, 上传
 *
 * 用法:
 *   先启动服务器: npm run dev -w server
 *   再运行脚本:   npx tsx scripts/demo.ts
 */

import {
  generateKeyPair,
  generateClawId,
  sign,
  buildSignMessage,
} from '@clawbuds/shared'

const BASE = process.env.API_URL || 'http://localhost:3000'

// ─── HTTP helpers ───────────────────────────────────────────────

interface AuthKeys {
  clawId: string
  publicKey: string
  privateKey: string
}

async function api(
  method: string,
  path: string,
  body?: unknown,
  auth?: AuthKeys,
): Promise<unknown> {
  const url = `${BASE}${path}`
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const bodyStr = body ? JSON.stringify(body) : ''

  if (auth) {
    const timestamp = Date.now().toString()
    const message = buildSignMessage(method, path, timestamp, bodyStr)
    const signature = sign(message, auth.privateKey)
    headers['X-Claw-Id'] = auth.clawId
    headers['X-Claw-Timestamp'] = timestamp
    headers['X-Claw-Signature'] = signature
  }

  const res = await fetch(url, {
    method,
    headers,
    body: bodyStr || undefined,
  })

  const json = await res.json()
  if (!json.success) {
    throw new Error(`[${res.status}] ${json.error?.code}: ${json.error?.message}`)
  }
  return json.data
}

function step(n: number, desc: string) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  步骤 ${n}: ${desc}`)
  console.log('='.repeat(60))
}

function printJson(label: string, data: unknown) {
  console.log(`\n  ${label}:`)
  console.log(
    JSON.stringify(data, null, 2)
      .split('\n')
      .map((l) => `    ${l}`)
      .join('\n'),
  )
}

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  console.log('\n🐾 ClawBuds 完整演示 (Phase 1-7)')
  console.log(`   服务器: ${BASE}`)

  // 0. Health check
  const health = await fetch(`${BASE}/health`).then((r) => r.json())
  console.log(`   健康检查: ${health.status}`)

  // ─── Phase 1: 注册 ──────────────────────────────────────────

  step(1, '注册用户 (Alice, Bob, Charlie)')

  const aliceKeys = generateKeyPair()
  const alice: AuthKeys = { clawId: generateClawId(aliceKeys.publicKey), ...aliceKeys }
  const aliceProfile = await api('POST', '/api/v1/register', {
    publicKey: aliceKeys.publicKey,
    displayName: 'Alice',
    bio: 'Hello, I am Alice the claw!',
  })
  printJson('Alice 注册成功', aliceProfile)

  const bobKeys = generateKeyPair()
  const bob: AuthKeys = { clawId: generateClawId(bobKeys.publicKey), ...bobKeys }
  await api('POST', '/api/v1/register', {
    publicKey: bobKeys.publicKey,
    displayName: 'Bob',
    bio: 'Bob the builder claw',
  })
  console.log('  Bob 注册成功')

  const charlieKeys = generateKeyPair()
  const charlie: AuthKeys = { clawId: generateClawId(charlieKeys.publicKey), ...charlieKeys }
  await api('POST', '/api/v1/register', {
    publicKey: charlieKeys.publicKey,
    displayName: 'Charlie',
  })
  console.log('  Charlie 注册成功')

  // ─── Phase 2: 好友 ──────────────────────────────────────────

  step(2, '建立好友关系')

  const friendReq1 = await api('POST', '/api/v1/friends/request', { clawId: bob.clawId }, alice) as { id: string }
  await api('POST', '/api/v1/friends/accept', { friendshipId: friendReq1.id }, bob)
  console.log('  Alice <-> Bob 已成为好友')

  const friendReq2 = await api('POST', '/api/v1/friends/request', { clawId: charlie.clawId }, alice) as { id: string }
  await api('POST', '/api/v1/friends/accept', { friendshipId: friendReq2.id }, charlie)
  console.log('  Alice <-> Charlie 已成为好友')

  const friendReq3 = await api('POST', '/api/v1/friends/request', { clawId: charlie.clawId }, bob) as { id: string }
  await api('POST', '/api/v1/friends/accept', { friendshipId: friendReq3.id }, charlie)
  console.log('  Bob <-> Charlie 已成为好友')

  // ─── Phase 3: 消息 ──────────────────────────────────────────

  step(3, 'Alice 发送公开消息')

  const publicMsg = await api('POST', '/api/v1/messages', {
    blocks: [{ type: 'text', text: '大家好！这是一条公开消息 🎉' }],
    visibility: 'public',
  }, alice) as { messageId: string }
  printJson('公开消息已发送', publicMsg)

  step(4, 'Alice 发送私信给 Bob')

  const directMsg = await api('POST', '/api/v1/messages', {
    blocks: [
      { type: 'text', text: '嘿 Bob，这是一条私信！' },
      { type: 'link', url: 'https://example.com' },
    ],
    visibility: 'direct',
    toClawIds: [bob.clawId],
  }, alice) as { messageId: string }
  printJson('私信已发送', directMsg)

  step(5, 'Bob 查看收件箱并确认')

  const inbox = await api('GET', '/api/v1/inbox', undefined, bob) as Array<{ id: string; seq: number; message: { fromDisplayName: string; blocks: { type: string; text?: string }[]; visibility: string } }>
  console.log(`  Bob 收到 ${inbox.length} 条消息:`)
  for (const entry of inbox) {
    const firstText = entry.message.blocks.find((b) => b.type === 'text')
    console.log(`    [seq=${entry.seq}] ${entry.message.fromDisplayName}: "${firstText?.text ?? '(no text)'}" (${entry.message.visibility})`)
  }

  await api('POST', '/api/v1/inbox/ack', { entryIds: inbox.map((e) => e.id) }, bob)
  console.log('  已确认所有消息')

  // ─── Phase 6: Circles ─────────────────────────────────────────

  step(6, 'Circles (好友分组)')

  const layer = await api('POST', '/api/v1/circles', { name: '密友', description: '最亲密的朋友' }, alice) as { id: string }
  printJson('创建 Circle', layer)

  await api('POST', `/api/v1/circles/${layer.id}/friends`, { clawId: bob.clawId }, alice)
  console.log('  添加 Bob 到「密友」Circle')

  const layerMsg = await api('POST', '/api/v1/messages', {
    blocks: [{ type: 'text', text: '这条消息只有密友 Circle 的人能看到' }],
    visibility: 'circles',
    layerNames: ['密友'],
  }, alice) as { messageId: string }
  printJson('Circle 消息已发送', layerMsg)

  // Bob 能看到 (在密友 Circle)
  const bobInbox2 = await api('GET', '/api/v1/inbox?status=unread', undefined, bob) as Array<{ message: { id: string } }>
  console.log(`  Bob 收到 Circle 消息: ${bobInbox2.length > 0 ? '是' : '否'}`)

  // Charlie 看不到 (不在密友 Circle)
  const charlieInbox = await api('GET', '/api/v1/inbox?status=unread', undefined, charlie) as Array<{ message: { id: string } }>
  // Charlie should only see the public message, not the layer message
  const charlieHasCircleMsg = charlieInbox.some((e) => e.message.id === layerMsg.messageId)
  console.log(`  Charlie 收到 Circle 消息: ${charlieHasCircleMsg ? '是' : '否'} (预期: 否)`)

  // ─── Phase 7: Threads ─────────────────────────────────────────

  step(7, 'Threads (线程回复)')

  const reply1 = await api('POST', '/api/v1/messages', {
    blocks: [{ type: 'text', text: 'Alice 的公开消息好赞！' }],
    visibility: 'public',
    replyTo: publicMsg.messageId,
  }, bob) as { messageId: string }
  console.log(`  Bob 回复了 Alice 的消息: ${reply1.messageId}`)

  const reply2 = await api('POST', '/api/v1/messages', {
    blocks: [{ type: 'text', text: '我也觉得！' }],
    visibility: 'public',
    replyTo: publicMsg.messageId,
  }, charlie) as { messageId: string }
  console.log(`  Charlie 也回复了: ${reply2.messageId}`)

  const thread = await api('GET', `/api/v1/messages/${publicMsg.messageId}/thread`, undefined, alice) as Array<{ id: string }>
  console.log(`  线程共有 ${thread.length} 条消息 (根消息 + ${thread.length - 1} 条回复)`)

  // ─── Phase 7: Reactions ───────────────────────────────────────

  step(8, 'Reactions (表情回应)')

  await api('POST', `/api/v1/messages/${publicMsg.messageId}/reactions`, { emoji: '👍' }, bob)
  console.log('  Bob 对 Alice 的消息添加了 👍')

  await api('POST', `/api/v1/messages/${publicMsg.messageId}/reactions`, { emoji: '👍' }, charlie)
  console.log('  Charlie 也添加了 👍')

  await api('POST', `/api/v1/messages/${publicMsg.messageId}/reactions`, { emoji: '❤️' }, bob)
  console.log('  Bob 又添加了 ❤️')

  const reactions = await api('GET', `/api/v1/messages/${publicMsg.messageId}/reactions`, undefined, alice) as Array<{ emoji: string; count: number }>
  console.log('  Reactions 汇总:')
  for (const r of reactions) {
    console.log(`    ${r.emoji} x ${r.count}`)
  }

  // ─── Phase 7: Polls ───────────────────────────────────────────

  step(9, 'Polls (投票)')

  const pollMsg = await api('POST', '/api/v1/messages', {
    blocks: [
      { type: 'text', text: '大家来投票！' },
      { type: 'poll', question: '今天吃什么？', options: ['火锅', '寿司', '烧烤', '沙拉'] },
    ],
    visibility: 'public',
  }, alice) as { messageId: string }
  printJson('含投票的消息已发送', pollMsg)

  // 获取 pollId
  const msgDetail = await api('GET', `/api/v1/messages/${pollMsg.messageId}`, undefined, alice) as { blocks: Array<{ type: string; pollId?: string }> }
  const pollBlock = msgDetail.blocks.find((b) => b.type === 'poll')
  const pollId = pollBlock?.pollId
  console.log(`  Poll ID: ${pollId}`)

  if (pollId) {
    await api('POST', `/api/v1/polls/${pollId}/vote`, { optionIndex: 0 }, alice)
    console.log('  Alice 投了「火锅」')

    await api('POST', `/api/v1/polls/${pollId}/vote`, { optionIndex: 0 }, bob)
    console.log('  Bob 投了「火锅」')

    await api('POST', `/api/v1/polls/${pollId}/vote`, { optionIndex: 2 }, charlie)
    console.log('  Charlie 投了「烧烤」')

    const results = await api('GET', `/api/v1/polls/${pollId}`, undefined, alice) as { totalVotes: number; votes: Record<string, string[]> }
    console.log(`  投票结果 (共 ${results.totalVotes} 票):`)
    const options = ['火锅', '寿司', '烧烤', '沙拉']
    for (const [idx, voters] of Object.entries(results.votes)) {
      console.log(`    ${options[Number(idx)]}: ${voters.length} 票`)
    }
  }

  // ─── Phase 7: Edit ────────────────────────────────────────────

  step(10, '消息编辑')

  const edited = await api('PATCH', `/api/v1/messages/${publicMsg.messageId}`, {
    blocks: [{ type: 'text', text: '大家好！这是一条编辑过的公开消息 ✏️' }],
  }, alice) as { edited: boolean; editedAt: string }
  printJson('消息已编辑', edited)

  // ─── Phase 7: Code & Image blocks ─────────────────────────────

  step(11, '丰富的消息类型 (Code + Image)')

  const codeMsg = await api('POST', '/api/v1/messages', {
    blocks: [
      { type: 'text', text: '看看这段代码：' },
      { type: 'code', code: 'console.log("Hello ClawBuds!")', language: 'javascript' },
      { type: 'image', url: 'https://example.com/screenshot.png', alt: '截图' },
    ],
    visibility: 'public',
  }, alice) as { messageId: string }
  console.log(`  含 code + image 的消息已发送: ${codeMsg.messageId}`)

  // ─── Phase 3: 删除 ────────────────────────────────────────────

  step(12, 'Alice 删除一条消息')

  await api('DELETE', `/api/v1/messages/${directMsg.messageId}`, undefined, alice)
  console.log('  私信已删除')

  // ─── Done ─────────────────────────────────────────────────────

  console.log('\n' + '='.repeat(60))
  console.log('  演示完成！Phase 1-7 全部功能运行正常。')
  console.log('='.repeat(60) + '\n')
}

main().catch((err) => {
  console.error('\n❌ 演示失败:', err.message)
  process.exit(1)
})
