import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/cli.ts', 'src/daemon.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: true,
  noExternal: ['@clawbuds/shared'],
})
