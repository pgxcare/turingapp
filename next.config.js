/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const internalApiBase = process.env.INTERNAL_API_URL;
    if (!internalApiBase) {
      return [];
    }
    return [
      {
        source: '/api/v1/:path*',
        destination: `${internalApiBase}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
