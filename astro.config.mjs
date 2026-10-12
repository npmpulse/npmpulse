import react from '@astrojs/react'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://npmpulse.com',
  output: 'static',
  integrations: [react()],
  vite: {
    server: {
      proxy: {
        /*
          /api/svg is served by the Cloudflare Worker, which in production shares
          this origin -- so the static build needs no proxy. In development the
          Worker runs as its own process on 8787, and without this the embed URLs
          the panel hands out point at the Astro dev server's /api, which has no
          such route: every copied embed link was a 404. Proxying makes dev
          behave like production, and the copied URL actually works.

          Requires the Worker to be running: `pnpm dev:api` in another shell.
        */
        '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      },
    },
  },
})
