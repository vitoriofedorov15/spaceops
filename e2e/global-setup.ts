import { dataSource } from '../apps/api/src/database/data-source';
import { seed } from '../apps/api/src/database/seed';

export default async function globalSetup() {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error('E2E setup may only reset a dedicated database ending in _test');
  }
  process.env.DEMO_PASSWORD ??= 'SpaceOps-test-2026!';
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
    // Reset the entire disposable fixture, including demo labels and passwords.
    // The database-name guard above must run before any destructive statement.
    await dataSource.query('TRUNCATE sites, users CASCADE');
    await seed();
    // The dedicated test database is disposable. Reset workflow records so a
    // failed run cannot leave restrictions that break the next run.
    await dataSource.transaction(async (manager) => {
      await manager.query(`TRUNCATE audit_logs, notifications, relocation_proposals,
        ticket_comments, tickets, availability_blocks, booking_requirements, bookings CASCADE`);
      await manager.query("UPDATE equipment SET state='working'");
    });
  } finally {
    await dataSource.destroy();
  }
}
