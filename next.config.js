/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // HANYA INI yang boleh ada:
  serverExternalPackages: ['@supabase/supabase-js'],
  
  // HAPUS SEMUA yang lain:
  // JANGAN ADA experimental: { serverComponentsExternalPackages: [...] }
  // JANGAN ADA api: { ... } di root
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;