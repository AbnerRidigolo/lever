import { readFileSync } from 'node:fs';

import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigStore } from '../src/config/config-store.js';
import { createMetrics } from '../src/metrics.js';
import { silentLogger } from './helpers.js';

// The "Lever / Decisão" dashboard (spec 001 section 10; quality plan, D5 and D6). This test keeps
// its PromQL in sync with the metrics this service registers, without Postgres or Grafana.
const DASHBOARD_URL = new URL(
  '../../../infra/grafana/dashboards/lever-decision.json',
  import.meta.url,
);
// The datasource provisioned in infra/grafana/provisioning/datasources/prometheus.yml.
const PROMETHEUS_DATASOURCE = { type: 'prometheus', uid: 'prometheus' };

const datasourceSchema = z.object({ type: z.string(), uid: z.string() });
const panelSchema = z.object({
  id: z.number().int(),
  type: z.string(),
  title: z.string().min(1),
  datasource: datasourceSchema.optional(),
  targets: z
    .array(z.object({ refId: z.string(), datasource: datasourceSchema, expr: z.string().min(1) }))
    .optional(),
});
const dashboardSchema = z.object({
  uid: z.string(),
  title: z.string(),
  id: z.null(),
  panels: z.array(panelSchema).min(1),
  templating: z.object({
    list: z.array(
      z.object({ name: z.string(), datasource: datasourceSchema, definition: z.string() }),
    ),
  }),
});
type Dashboard = z.infer<typeof dashboardSchema>;

let dashboard: Dashboard;
/** Label names per series name, as exposed on /metrics (histograms appear as _bucket, _sum, _count). */
const exposed = new Map<string, Set<string>>();

/** Metric names used in a PromQL expression, without the series Prometheus generates itself. */
function metricNames(expr: string): string[] {
  return [...expr.matchAll(/\b(lever_decision_\w+)\b/g)].map((match) => match[1] ?? '');
}

/** Label names an expression filters on or groups by. */
function labelNames(expr: string): string[] {
  const labels: string[] = [];
  for (const [, matchers = ''] of expr.matchAll(/lever_decision_\w+\{([^}]*)\}/g)) {
    labels.push(
      ...[...matchers.matchAll(/(\w+)\s*(?:=~|!~|!=|=)/g)].map((match) => match[1] ?? ''),
    );
  }
  for (const [, grouping = ''] of expr.matchAll(/\bby\s*\(([^)]*)\)/g)) {
    labels.push(...grouping.split(',').map((label) => label.trim()));
  }
  return labels;
}

function expressions(): { title: string; expr: string }[] {
  return dashboard.panels.flatMap((panel) =>
    (panel.targets ?? []).map((target) => ({ title: panel.title, expr: target.expr })),
  );
}

beforeAll(async () => {
  dashboard = dashboardSchema.parse(JSON.parse(readFileSync(DASHBOARD_URL, 'utf8')));

  const configStore = new ConfigStore({
    load: () => Promise.resolve({ version: 1, flags: [], experiments: [], segments: [] }),
    logger: silentLogger,
  });
  await configStore.get('environment-1');
  const metrics = createMetrics({ configStore });
  // One sample of every labelled metric, so the exposition lists its label names.
  const labels = { method: 'GET', route: '/v1/config', status_code: '200' };
  metrics.httpRequests.inc(labels);
  metrics.httpRequestDuration.observe(labels, 0.001);
  metrics.streamClients.set({ environment_id: 'environment-1' }, 1);

  for (const line of (await metrics.registry.metrics()).split('\n')) {
    const match = /^(\w+)(?:\{(.*)\})? /.exec(line);
    if (match === null) continue;
    const [, name = '', rawLabels = ''] = match;
    const names = exposed.get(name) ?? new Set<string>();
    for (const [, label = ''] of rawLabels.matchAll(/(\w+)="/g)) names.add(label);
    exposed.set(name, names);
  }
});

describe('Grafana dashboard "Lever / Decisão"', () => {
  it('spec 001 section 10: is the provisioned "Decisão" dashboard with a fixed uid', () => {
    expect(dashboard.uid).toBe('lever-decision');
    // Shown as "Lever / Decisão": the provisioning puts it in the "Lever" folder.
    expect(dashboard.title).toBe('Decisão');
  });

  it('spec 001 section 10: every panel and variable uses the provisioned Prometheus datasource', () => {
    for (const panel of dashboard.panels.filter((panel) => panel.type !== 'row')) {
      expect(panel.datasource, panel.title).toEqual(PROMETHEUS_DATASOURCE);
      for (const target of panel.targets ?? []) {
        expect(target.datasource, panel.title).toEqual(PROMETHEUS_DATASOURCE);
      }
    }
    for (const variable of dashboard.templating.list) {
      expect(variable.datasource, variable.name).toEqual(PROMETHEUS_DATASOURCE);
    }
  });

  it('spec 001 section 10: panel ids are unique', () => {
    const ids = dashboard.panels.map((panel) => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('spec 001 section 10: covers requests, latency, stream clients, config version and age', () => {
    const used = new Set(expressions().flatMap(({ expr }) => metricNames(expr)));
    expect([...used]).toEqual(
      expect.arrayContaining([
        'lever_decision_http_requests_total',
        'lever_decision_http_request_duration_seconds_bucket',
        'lever_decision_stream_clients',
        'lever_decision_config_version',
        'lever_decision_config_age_seconds',
      ]),
    );
  });

  it('spec 001 section 10: every metric in the dashboard is registered by the service', () => {
    for (const { title, expr } of expressions()) {
      for (const name of metricNames(expr)) {
        expect(exposed.has(name), `${title}: ${name}`).toBe(true);
      }
    }
  });

  it('spec 001 section 10: every label in the dashboard exists on the metrics it queries', () => {
    for (const { title, expr } of expressions()) {
      const available = new Set(
        metricNames(expr).flatMap((name) => [...(exposed.get(name) ?? [])]),
      );
      for (const label of labelNames(expr)) {
        expect(available.has(label), `${title}: label "${label}"`).toBe(true);
      }
    }
  });

  it('spec 001 section 10: variables read labels that the service exposes', () => {
    for (const variable of dashboard.templating.list) {
      const match = /^label_values\((\w+), (\w+)\)$/.exec(variable.definition);
      expect(match, variable.name).not.toBeNull();
      const [, metric = '', label = ''] = match ?? [];
      expect(exposed.get(metric)?.has(label), `${variable.name}: ${metric} / ${label}`).toBe(true);
    }
  });

  it('spec 001 section 10: latency panels leave out /v1/stream, whose duration is the whole connection', () => {
    for (const { title, expr } of expressions()) {
      if (expr.includes('lever_decision_http_request_duration_seconds')) {
        expect(expr, title).toContain('route!="/v1/stream"');
      }
    }
  });
});
