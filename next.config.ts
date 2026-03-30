import type { NextConfig } from 'next'

// Validate required server-side env vars at build/start time
const required = ['DATABASE_URL', 'SESSION_SECRET', 'API_URL', 'API_TOKEN']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
