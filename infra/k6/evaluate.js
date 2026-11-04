// Load test for NFR-002 (spec 001): remote evaluation p99 under 20 ms at 500 requests/s, locally.
// Plan: specs/001-plataforma-base/plan-quality.md (D1 to D4). How to run: infra/k6/README.md.
//
//   k6 run -e SCENARIO=evaluate infra/k6/evaluate.js   (NFR-002)
//   k6 run -e SCENARIO=config infra/k6/evaluate.js     (reference only)
//
// The API key is read from the LEVER_API_KEY environment variable of the shell (not from `-e`,
// so it stays out of the command line) and is never printed or written by this script.
import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';

const SCENARIOS = ['evaluate', 'config'];
const SCENARIO = __ENV.SCENARIO || 'evaluate';
const BASE_URL = (__ENV.DECISION_URL || 'http://localhost:4000').replace(/\/$/, '');
const API_KEY = __ENV.LEVER_API_KEY || '';
// The NFR-002 target. Overridable only for quick smoke runs; measurements use the defaults.
const RATE = Number(__ENV.RATE || 500);
const DURATION = __ENV.DURATION || '60s';
const WARMUP_RATE = Number(__ENV.WARMUP_RATE || 100);
const WARMUP = __ENV.WARMUP || '15s';
const RESULTS_DIR = __ENV.RESULTS_DIR || 'infra/k6/results';

if (!SCENARIOS.includes(SCENARIO)) {
  throw new Error(`SCENARIO must be one of ${SCENARIOS.join(', ')}; got "${SCENARIO}"`);
}

// Synthetic attributes only (AGENTS.md: no real data).
const COUNTRIES = ['BR', 'US', 'PT', 'AR', 'MX'];
const DEVICES = ['mobile', 'desktop', 'tablet'];
// Keys created by the seed of packages/db.
const FLAGS = ['new-banner'];
const EXPERIMENTS = ['checkout-layout'];

function arrivalRate(rate, duration, startTime) {
  return {
    executor: 'constant-arrival-rate',
    rate,
    timeUnit: '1s',
    duration,
    startTime,
    preAllocatedVUs: 50,
    maxVUs: 200,
    exec: SCENARIO,
  };
}

// Only the "measure" scenario counts; the warm-up lets the JIT and the caches settle first.
const MEASURED = '{scenario:measure}';

export const options = {
  scenarios: {
    warmup: arrivalRate(WARMUP_RATE, WARMUP, '0s'),
    measure: arrivalRate(RATE, DURATION, WARMUP),
  },
  thresholds: {
    [`http_req_duration${MEASURED}`]: ['p(99)<20'],
    [`http_req_failed${MEASURED}`]: ['rate<0.001'],
    // The target rate must really be sent: a dropped iteration means k6 ran out of VUs.
    [`dropped_iterations${MEASURED}`]: ['count==0'],
    [`checks${MEASURED}`]: ['rate>0.999'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

function headers() {
  return { authorization: `Bearer ${API_KEY}`, 'content-type': 'application/json' };
}

function evaluateBody(userId) {
  return JSON.stringify({
    user: {
      id: userId,
      attributes: {
        country: COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)],
        device: DEVICES[Math.floor(Math.random() * DEVICES.length)],
      },
    },
    flags: FLAGS,
    experiments: EXPERIMENTS,
  });
}

function hasVersion(response) {
  try {
    return typeof response.json('version') === 'number';
  } catch {
    return false;
  }
}

export function setup() {
  if (API_KEY === '') {
    exec.test.abort(
      'LEVER_API_KEY is not set. Create one with: pnpm --filter @lever/decision api-key:create -- --env development --name k6',
    );
  }
  // One probe request, so a broken setup fails fast instead of producing a meaningless report.
  const probe =
    SCENARIO === 'evaluate'
      ? http.post(`${BASE_URL}/v1/evaluate`, evaluateBody('k6-probe'), { headers: headers() })
      : http.get(`${BASE_URL}/v1/config`, { headers: headers() });
  if (SCENARIO === 'evaluate' && probe.status === 500) {
    exec.test.abort(
      'POST /v1/evaluate answered 500: evaluation is not implemented yet (reserved for the author, packages/evaluation). NFR-002 cannot be measured.',
    );
  }
  if (probe.status !== 200) {
    exec.test.abort(`probe request to ${BASE_URL} answered ${probe.status}; expected 200`);
  }
}

export function evaluate() {
  const userId = `k6-user-${exec.vu.idInTest}-${exec.vu.iterationInScenario}`;
  const response = http.post(`${BASE_URL}/v1/evaluate`, evaluateBody(userId), {
    headers: headers(),
    tags: { name: 'POST /v1/evaluate' },
  });
  check(response, {
    'status is 200': (r) => r.status === 200,
    'body has version': hasVersion,
  });
}

export function config() {
  const response = http.get(`${BASE_URL}/v1/config`, {
    headers: headers(),
    tags: { name: 'GET /v1/config' },
  });
  check(response, {
    'status is 200': (r) => r.status === 200,
    'body has version': hasVersion,
  });
}

function metricValue(data, name, stat) {
  const metric = data.metrics[name];
  return metric === undefined ? undefined : metric.values[stat];
}

function format(value, unit) {
  return value === undefined ? 'n/a' : `${value.toFixed(2)}${unit}`;
}

export function handleSummary(data) {
  const duration = `http_req_duration${MEASURED}`;
  const failed = `http_req_failed${MEASURED}`;
  const dropped = `dropped_iterations${MEASURED}`;
  const thresholds = Object.entries(data.metrics)
    .filter(([, metric]) => metric.thresholds !== undefined)
    .flatMap(([name, metric]) =>
      Object.entries(metric.thresholds).map(
        ([expression, result]) => `  ${result.ok ? 'PASS' : 'FAIL'}  ${name}: ${expression}`,
      ),
    );
  const requests = metricValue(data, 'http_reqs', 'count');
  if ((metricValue(data, 'iterations', 'count') ?? 0) === 0) {
    // Aborted in setup() or no request reached the measured phase: thresholds without data pass
    // vacuously, so they are not printed.
    return {
      stdout: `\nLever NFR-002 load test: scenario "${SCENARIO}" measured no requests (see the error above).\n`,
    };
  }
  const lines = [
    '',
    `Lever NFR-002 load test: scenario "${SCENARIO}" at ${RATE} req/s for ${DURATION} (after ${WARMUP} warm-up)`,
    `  target: ${BASE_URL}`,
    `  latency (measured phase): p50 ${format(metricValue(data, duration, 'med'), ' ms')}, p95 ${format(metricValue(data, duration, 'p(95)'), ' ms')}, p99 ${format(metricValue(data, duration, 'p(99)'), ' ms')}, max ${format(metricValue(data, duration, 'max'), ' ms')}`,
    `  failed requests: ${format((metricValue(data, failed, 'rate') ?? 0) * 100, ' %')}, dropped iterations: ${metricValue(data, dropped, 'count') ?? 0}`,
    `  total requests (warm-up included): ${requests ?? 'n/a'}`,
    'Thresholds:',
    ...thresholds,
    '',
  ];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    stdout: lines.join('\n'),
    [`${RESULTS_DIR}/${SCENARIO}-${stamp}.json`]: JSON.stringify(data, null, 2),
  };
}
