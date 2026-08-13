import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { Initial1700000000000 } from './migrations/1700000000000-Initial';
config({ path: resolve(process.cwd(), '.env'), quiet: true });
config({ path: resolve(process.cwd(), '../../.env'), quiet: true });
export const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  synchronize: false,
  migrationsRun: false,
  logging: false,
  migrations: [Initial1700000000000],
  extra: { max: 15 },
});
