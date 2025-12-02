/** @type {import('next').NextConfig} */
const nextConfig = {
  // HAPUS SEMUA experimental yang error
  // experimental: {  // HAPUS BAGIAN INI
  //   serverComponentsExternalPackages: ['@supabase/supabase-js']
  // },
  
  // GUNAKAN INI:
  serverExternalPackages: ['@supabase/supabase-js'],
  
  // HAPUS 'api' dari root, pindahkan ke sini:
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb'
    }
  },
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;