import { Controller, Get, Inject, Module } from '@nestjs/common';
import { Database, DatabaseModule } from './database/database.module';
@Controller('health')
class HealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Get()
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok' };
  }
}
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
})
export class AppModule {}
