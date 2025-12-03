/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // HAPUS swcMinify karena sudah tidak perlu di Next.js 16
  // swcMinify: true, // <- HAPUS BARIS INI
  
  // Konfigurasi untuk menghindari konflik Turbopack
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', 'pt-eltama-monitor.vercel.app']
    },
    // Tambah ini untuk nonaktifkan Turbopack di production build
    turbo: {
      // Rules untuk module yang perlu di-externalize
      resolveAlias: {
        // Tambah alias jika diperlukan
      }
    }
  },
  
  // TAMBAHKAN ini untuk disable Turbopack
  turbopack: undefined, // atau {} jika ingin kosong
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
    unoptimized: true,
  },
  
  // PERBAIKAN: Untuk package external di server components
  serverExternalPackages: [],
  
  // SIMPAN webpack config untuk compatibility
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: require.resolve('crypto-browserify'),
        stream: require.resolve('stream-browserify'),
        http: require.resolve('stream-http'),
        https: require.resolve('https-browserify'),
        os: require.resolve('os-browserify/browser'),
        path: require.resolve('path-browserify'),
        zlib: require.resolve('browserify-zlib'),
      };
    }
    return config;
  },
};

module.exports = nextConfig;