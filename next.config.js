/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const internalApiBase = process.env.INTERNAL_API_URL || 'http://api:8000/api/v1';
    return {
      fallback: [
        {
          source: '/api/v1/:path*',
          destination: `${internalApiBase}/:path*`
        }
      ]
    };
  },
};

module.exports = nextConfig;
