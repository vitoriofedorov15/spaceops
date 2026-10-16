import { Controller, Get, Inject, Module } from '@nestjs/common';
import { Database, DatabaseModule } from './database/database.module';
import { AuthModule, Public } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { UsersModule } from './users/users.module';
import { SpacesModule } from './spaces/spaces.module';
import { BookingsModule } from './bookings/bookings.module';
import { EquipmentModule } from './equipment/equipment.module';
import { TicketsModule } from './tickets/tickets.module';
import { RelocationsModule } from './relocations/relocations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AnalyticsModule } from './analytics/analytics.module';
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
  imports: [DatabaseModule, AuthModule, AuditModule, UsersModule, SpacesModule, BookingsModule, EquipmentModule, TicketsModule, RelocationsModule, NotificationsModule, AnalyticsModule],
  controllers: [HealthController],
})
export class AppModule {}
