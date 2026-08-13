import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { dataSource } from './data-source';
export interface SQL {
  query(sql: string, params?: unknown[]): Promise<any[]>;
}
@Injectable()
export class Database implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (!dataSource.isInitialized) await dataSource.initialize();
  }
  async onModuleDestroy() {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
  async query<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const q = dataSource.createQueryRunner();
    try {
      return (await q.query(sql, params, true)).records;
    } finally {
      await q.release();
    }
  }
  async transaction<T>(work: (q: SQL) => Promise<T>): Promise<T> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    // Structured results keep UPDATE/DELETE ... RETURNING consistent with SELECT/INSERT.
    // TypeORM's default raw UPDATE result is [rows, affectedCount], not a row array.
    const q: SQL = {
      query: async (sql, params = []) => (await runner.query(sql, params, true)).records,
    };
    try {
      const result = await work(q);
      await runner.commitTransaction();
      return result;
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
