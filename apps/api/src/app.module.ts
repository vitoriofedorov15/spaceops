import { Controller, Get, Inject, Module } from '@nestjs/common';
import { Database, DatabaseModule } from './database/database.module';
import { AuthModule, Public } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { SpacesModule } from './spaces/spaces.module';
import { BookingsModule } from './bookings/bookings.module';
@Controller('health')
class HealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Public()
  @Get()
  async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok' };
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, AuditModule, UsersModule, SpacesModule, BookingsModule],
  controllers: [HealthController],
})
export class AppModule {}
