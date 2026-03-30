import type { NextConfig } from 'next'

// Validate required env vars at runtime only (not during docker build)
if (process.env.NODE_ENV !== 'test' && process.env.NEXT_PHASE !== 'phase-production-build') {
  const required = ['DATABASE_URL', 'SESSION_SECRET', 'API_URL', 'API_TOKEN']
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
