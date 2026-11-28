import {
  collectorEventSchema,
  eventBatchSchema,
  MAX_EVENT_AGE_MS,
  MAX_EVENT_FUTURE_SKEW_MS,
  type BronzeEventRecord,
  type EventBatchResponse,
} from '@lever/schemas';
import { HttpError, type AuthenticatedKey } from '@lever/service-kit';

export type EventRejection = EventBatchResponse['rejected'][number];

export interface IngestResult {
  records: BronzeEventRecord[];
  rejected: EventRejection[];
  /** Event `type` of each rejection, aligned with `rejected`; `unknown` when the event did not parse. */
  rejectedTypes: string[];
}

/**
 * Validates a batch event by event and builds the bronze records. Pure: the clock is `receivedAt`.
 * Environment and key come from `auth`, never from the body (002/AC-2.4); unknown fields of an
 * event are dropped by the schema. A malformed container throws a 400 `HttpError`.
 */
export function ingestBatch(body: unknown, auth: AuthenticatedKey, receivedAt: Date): IngestResult {
  const batch = eventBatchSchema.safeParse(body);
  if (!batch.success) {
    throw new HttpError(
      'bad_request',
      'Body must be {"events": [...]} with 1 to 500 events',
      batch.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }

  const received = receivedAt.getTime();
  const receivedAtIso = receivedAt.toISOString();
  const records: BronzeEventRecord[] = [];
  const rejected: EventRejection[] = [];
  const rejectedTypes: string[] = [];

  batch.data.events.forEach((candidate, index) => {
    const parsed = collectorEventSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where =
        issue === undefined || issue.path.length === 0 ? '' : `${issue.path.join('.')}: `;
      rejected.push({
        index,
        code: 'invalid_event',
        message: `${where}${issue?.message ?? 'invalid event'}`,
      });
      rejectedTypes.push('unknown');
      return;
    }

    const timestamp = Date.parse(parsed.data.timestamp);
    if (
      timestamp > received + MAX_EVENT_FUTURE_SKEW_MS ||
      timestamp < received - MAX_EVENT_AGE_MS
    ) {
      rejected.push({
        index,
        code: 'timestamp_out_of_range',
        message: 'timestamp must be at most 5 minutes ahead and at most 7 days old',
      });
      rejectedTypes.push(parsed.data.type);
      return;
    }

    records.push({
      event: parsed.data,
      receivedAt: receivedAtIso,
      environmentId: auth.environmentId,
      apiKeyId: auth.apiKeyId,
    });
  });

  return { records, rejected, rejectedTypes };
}
