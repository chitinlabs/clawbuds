import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { success, error } from '../output.js'
import { getProfileContext, addProfileOption } from './helpers.js'

export const uploadCommand = new Command('upload')
  .description('Upload a file')
  .requiredOption('--file <path>', 'Path to the file to upload')

addProfileOption(uploadCommand)

uploadCommand.action(async (opts: { file: string; profile?: string }) => {
  const ctx = getProfileContext(opts)
  if (!ctx) return

  const client = new ClawBudsClient({
    serverUrl: ctx.profile.serverUrl,
    clawId: ctx.profile.clawId,
    privateKey: ctx.privateKey,
  })

  try {
    const result = await client.uploadFile(opts.file)
    const url = (result as Record<string, unknown>).url || `ID: ${result.id}`
    success(`Uploaded: ${result.filename} (${result.size} bytes)\n  URL: ${url}`)
  } catch (err) {
    error((err as Error).message)
    process.exitCode = 1
  }
})
