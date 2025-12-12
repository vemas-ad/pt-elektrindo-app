/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // 1. HANYA INI YANG ADA - tanpa 'api', tanpa 'experimental.serverComponentsExternalPackages'
  serverExternalPackages: ["formidable"],
  
  // 2. Konfigurasi images untuk Supabase
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  
  // 3. HAPUS SEMUA yang lain:
  // - Tidak ada 'api'
  // - Tidak ada 'experimental.serverComponentsExternalPackages' 
  // - Tidak ada 'experimental.turbo'
  // - Tidak ada 'webpack' config
  // - Tidak ada 'turbopack: {}'
};

module.exports = nextConfig;