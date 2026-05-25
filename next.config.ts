import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Allow images from Google user content (profile pictures)
  images: {
    domains: ['lh3.googleusercontent.com'],
  },
}

export default nextConfig
