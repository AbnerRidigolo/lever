import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { useTestDb } from './helpers.js';

const db = useTestDb();

describe('migrations', () => {
  it('create every table of the data model (spec 001, section 7)', async () => {
    const rows = await db.execute<{ table_name: string }>(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    expect(rows.map((row) => row.table_name)).toEqual([
      'api_keys',
      'audit_log',
      'config_versions',
      'environments',
      'experiment_environments',
      'experiment_variants',
      'experiments',
      'flag_environments',
      'flags',
      'project_members',
      'projects',
      'segments',
      'users',
    ]);
  });

  it('give every table id, created_at and updated_at (spec 001, section 7)', async () => {
    const rows = await db.execute<{ table_name: string; columns: string[] }>(sql`
      SELECT table_name, array_agg(column_name::text) AS columns
      FROM information_schema.columns
      WHERE table_schema = 'public'
      GROUP BY table_name
    `);
    expect(rows).toHaveLength(13);
    for (const row of rows) {
      expect(row.columns, row.table_name).toEqual(
        expect.arrayContaining(['id', 'created_at', 'updated_at']),
      );
    }
  });

  it('run on Postgres 17 with the pgvector extension available for phase 3', async () => {
    const [version] = await db.execute<{ server_version_num: string }>(
      sql`SHOW server_version_num`,
    );
    expect(Number(version?.server_version_num)).toBeGreaterThanOrEqual(170_000);
    expect(Number(version?.server_version_num)).toBeLessThan(180_000);

    const extensions = await db.execute<{ name: string }>(
      sql`SELECT name FROM pg_available_extensions WHERE name = 'vector'`,
    );
    expect(extensions).toHaveLength(1);
  });
});
