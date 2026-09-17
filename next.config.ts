import type {NextConfig} from 'next';

// Dynamic subpath support for deployments such as https://vivonline.ru/meetings
// If BASE_PATH or NEXT_PUBLIC_BASE_PATH is provided (e.g. "/meetings"), Next.js applies it.
// If empty, undefined, or "/", the application runs on standard direct root paths ("/").
const rawBasePath = (process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '').trim();
const cleanBasePath = rawBasePath && rawBasePath !== '/'
  ? (rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`).replace(/\/+$/, '')
  : '';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(cleanBasePath ? { basePath: cleanBasePath } : {}),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**', // This allows any path under the hostname
      },
    ],
  },
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
