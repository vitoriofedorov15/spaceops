import { dataSource } from './data-source';
import { seed } from './seed';
async function run() {
  await dataSource.initialize();
  try {
    if (process.argv[2] === 'migrate') {
      await dataSource.runMigrations({ transaction: 'all' });
      console.log('Migrations complete');
    } else if (process.argv[2] === 'seed') {
      await seed();
      console.log('Demo seed complete (existing data preserved)');
    } else throw new Error('Usage: cli migrate|seed');
  } finally {
    await dataSource.destroy();
  }
}
run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
