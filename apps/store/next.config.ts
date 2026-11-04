import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Node-only packages, loaded from node_modules instead of being bundled.
  serverExternalPackages: ['pino', 'prom-client', '@opentelemetry/sdk-node'],
};

export default nextConfig;
