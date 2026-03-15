import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    nitro({
      preset: 'bun',
      // Force tslib to be bundled (not auto-externalized) so the __toESM bug manifests.
      // Without this, Nitro's dep-tracing externalizes tslib and the bug is masked.
      noExternals: true,
    }),
    tanstackStart({}),
    viteReact(),
  ],
})
