import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

test('committed baseline migration covers the notification schema and never drops data', () => {
  const baseline = readFileSync('prisma/migrations/0_init/migration.sql', 'utf8');
  assert.match(baseline, /CREATE TABLE "notifications"/);
  assert.match(baseline, /CREATE TABLE "notification_preferences"/);
  assert.match(baseline, /CREATE TABLE "post_subscriptions"/);
  assert.match(readFileSync('prisma/migrations/migration_lock.toml', 'utf8'), /provider = "postgresql"/);
  for (const dir of readdirSync('prisma/migrations', { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const sql = readFileSync(`prisma/migrations/${dir.name}/migration.sql`, 'utf8');
    assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i, dir.name);
  }
});
