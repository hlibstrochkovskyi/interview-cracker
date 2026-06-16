import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@orchestrator': resolve('src/orchestrator')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/orchestrator/**', 'src/shared/**'],
      reporter: ['text', 'lcov']
    }
  }
})
