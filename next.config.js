/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // INI YANG BENAR:
  serverExternalPackages: ['@supabase/supabase-js'],
  
  // HAPUS SEMUA 'experimental' yang bermasalah
  // JANGAN ada: experimental: { serverComponentsExternalPackages: [...] }
  
  // Untuk body size limit
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    }
  },
  
  // Image domains
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow all HTTPS images
      },
    ],
  },
};

module.exports = nextConfig;