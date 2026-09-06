import type { NextConfig } from 'next';

const nextConfig: NextConfig =
  process.env.FROSTLINE_TARGET === 'pages'
    ? {
        output: 'export',
        basePath: '/tiger-cloud-project',
        trailingSlash: true,
      }
    : {};

export default nextConfig;
