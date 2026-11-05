export interface BackoffOptions {
  initialDelayMs: number;
  maxDelayMs: number;
}

/**
 * Exponential backoff with "equal jitter" (sdk plan, D3): the delay doubles on every failure up to
 * the cap, and the wait is a random value between half the delay and the whole delay, so many
 * instances do not reconnect at the same time.
 */
export class Backoff {
  private attempt = 0;

  constructor(
    private readonly options: BackoffOptions,
    private readonly random: () => number = Math.random,
  ) {}

  /** Failures since the last reset. */
  get attempts(): number {
    return this.attempt;
  }

  /** The wait before the next attempt, in milliseconds. */
  next(): number {
    // The exponent is capped so 2 ** n never overflows; the delay is capped anyway.
    const exponent = Math.min(this.attempt, 30);
    const delay = Math.min(this.options.maxDelayMs, this.options.initialDelayMs * 2 ** exponent);
    this.attempt += 1;
    return Math.round(delay / 2 + this.random() * (delay / 2));
  }

  /** Called when a connection delivers a valid configuration. */
  reset(): void {
    this.attempt = 0;
  }
}
