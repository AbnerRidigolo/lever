// Preloaded with `node --import ./dist/telemetry.js` so instrumentation is in place before
// Fastify and node:http are loaded. Traces are exported only when OTEL_EXPORTER_OTLP_ENDPOINT
// is set (decision plan, D8).
import { FastifyOtelInstrumentation } from '@fastify/otel';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { parseEnv } from '@lever/schemas';

import { decisionEnvSchema } from './env.js';

const UNTRACED_PATHS = new Set(['/metrics', '/healthz']);

const env = parseEnv(
  decisionEnvSchema.pick({ OTEL_EXPORTER_OTLP_ENDPOINT: true, OTEL_SERVICE_NAME: true }),
  process.env,
);

if (env.OTEL_EXPORTER_OTLP_ENDPOINT !== undefined) {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/$/, '');
  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (request) => UNTRACED_PATHS.has(request.url ?? ''),
      }),
      new FastifyOtelInstrumentation({
        registerOnInitialization: true,
        ignorePaths: (route) => UNTRACED_PATHS.has(route.url),
      }),
    ],
  });
  sdk.start();

  const shutdown = (): void => {
    sdk.shutdown().catch((error: unknown) => {
      process.stderr.write(`failed to flush traces: ${String(error)}\n`);
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
