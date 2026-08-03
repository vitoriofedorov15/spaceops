import { Controller, Get, Inject, Module } from '@nestjs/common';
@Controller('health')
class HealthController {
  @Get()
  async health() {
    return { status: 'ok' };
  }
}
@Module({
  imports: [],
  controllers: [HealthController],
})
export class AppModule {}
