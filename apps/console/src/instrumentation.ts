// Loaded by Next.js once per server process. Traces are exported over OTLP only when
// OTEL_EXPORTER_OTLP_ENDPOINT is set (console plan, D10).
export async function register(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (process.env.NEXT_RUNTIME !== 'nodejs' || endpoint === undefined || endpoint === '') return;

  const [{ NodeSDK }, { OTLPTraceExporter }, { HttpInstrumentation }] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-http'),
    import('@opentelemetry/instrumentation-http'),
  ]);

  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'lever-console',
    traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [new HttpInstrumentation()],
  });
  sdk.start();
}
