/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['formidable'],
  },
  api: {
    bodyParser: false,
  },
}

module.exports = nextConfig