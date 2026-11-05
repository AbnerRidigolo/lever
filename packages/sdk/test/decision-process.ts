import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';

import { eventually } from './helpers.js';

const require = createRequire(import.meta.url);

/** `services/decision/dist/main.js`, built by Turbo before the tests (`^build`, sdk plan D12). */
export const DECISION_MAIN = join(
  dirname(require.resolve('@lever/decision/package.json')),
  'dist',
  'main.js',
);

/** A free TCP port on the loopback interface. */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === 'string') reject(new Error('no port'));
        else resolve(address.port);
      });
    });
  });
}

/**
 * The real decision service, run as a black box in a child process (sdk plan, D12):
 * no file of the service is imported or changed.
 */
export class DecisionProcess {
  private child: ChildProcess | undefined;
  private output = '';

  constructor(
    private readonly databaseUrl: string,
    readonly port: number,
  ) {}

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** Starts the service and waits until `/healthz` answers. */
  async start(): Promise<void> {
    const child = spawn(process.execPath, [DECISION_MAIN], {
      env: {
        ...process.env,
        DATABASE_URL: this.databaseUrl,
        DECISION_HOST: '127.0.0.1',
        DECISION_PORT: String(this.port),
        LOG_LEVEL: 'warn',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    const collect = (chunk: Buffer): void => {
      this.output = (this.output + chunk.toString('utf8')).slice(-4_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    try {
      await eventually(
        async () => {
          if (child.exitCode !== null) {
            throw new Error(`decision service exited with ${child.exitCode}: ${this.output}`);
          }
          const response = await fetch(`${this.url}/healthz`);
          if (!response.ok) throw new Error(`healthz answered ${response.status}`);
        },
        { timeoutMs: 20_000, intervalMs: 100 },
      );
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  /** Kills the service, as a crash would. */
  async stop(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    if (child === undefined) return;
    if (child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => {
        resolve();
      });
      child.kill('SIGKILL');
    });
  }
}
