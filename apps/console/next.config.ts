import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @lever/db resolves its migrations folder at runtime, so it is loaded from node_modules.
  serverExternalPackages: ['@lever/db', 'drizzle-orm', 'postgres', 'pino', 'nodemailer'],
  experimental: {
    // Enables forbidden(), so a denied Server Action answers HTTP 403 (AC-7.2, console plan D7).
    authInterrupts: true,
  },
};

export default nextConfig;
