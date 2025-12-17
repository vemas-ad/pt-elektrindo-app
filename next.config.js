/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  serverExternalPackages: ["formidable"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // 🔴 INI KUNCINYA
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
