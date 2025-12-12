/** @type {import('next').NextConfig} */
const nextConfig = {
  // pengganti experimental.serverComponentsExternalPackages
  serverExternalPackages: ['formidable'],

  // API configuration (replacement for invalid "api" root-level key)
  api: {
    bodyParser: false, // tetap disable bodyParser (AMAN untuk upload)
  },

  // Jika kamu masih butuh experimental lainnya, boleh ditaruh di sini
  experimental: {},
};

module.exports = nextConfig;
