/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typescript: {
    // Errors are surfaced in development; build still succeeds to allow incremental fixing
    // TODO: remove once all 'any' types are resolved
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
}

module.exports = nextConfig
