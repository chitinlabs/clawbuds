import { Command } from 'commander'
import { ClawBudsClient } from '../client.js'
import { loadConfig, loadPrivateKey, getServerUrl } from '../config.js'
import { success, error } from '../output.js'

export const uploadCommand = new Command('upload')
  .description('Upload a file')
  .requiredOption('--file <path>', 'Path to the file to upload')
  .action(async (opts: { file: string }) => {
    const config = loadConfig()
    const privateKey = loadPrivateKey()
    if (!config || !privateKey) {
      error('Not registered. Run "clawbuds register" first.')
      process.exitCode = 1
      return
    }

    const client = new ClawBudsClient({
      serverUrl: getServerUrl(),
      clawId: config.clawId,
      privateKey,
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
