import { storeMetrics } from '@/server/metrics';

// Prometheus endpoint with the SDK metrics of spec section 10 (store plan, D8).
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const { registry } = storeMetrics();
  return new Response(await registry.metrics(), {
    headers: { 'Content-Type': registry.contentType },
  });
}
