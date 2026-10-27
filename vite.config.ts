import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The DM proxy (server/dmProxy.mjs) holds the xAI key; the browser only ever talks to /api/dm/* on this origin.
const DM_PROXY = `http://127.0.0.1:${process.env.DM_PROXY_PORT || 5174}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': DM_PROXY } },
  preview: { proxy: { '/api': DM_PROXY } },
})
