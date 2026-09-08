import { Global, Injectable, Module } from '@nestjs/common';
import { SQL } from '../database/database.module';
@Injectable()
export class Audit {
  async record(
    q: SQL,
    actor: string,
    action: string,
    type: string,
    id: string,
    changes: unknown = {},
  ) {
    await q.query(
      'INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,changes) VALUES($1,$2,$3,$4,$5)',
      [actor, action, type, id, JSON.stringify(changes)],
    );
  }
  async notify(q: SQL, user: string, type: string, message: string, id: string) {
    await q.query('INSERT INTO notifications(user_id,type,message,entity_id) VALUES($1,$2,$3,$4)', [
      user,
      type,
      message,
      id,
    ]);
  }
  async notifyManagers(q: SQL, type: string, message: string, id: string) {
    await q.query(
      "INSERT INTO notifications(user_id,type,message,entity_id) SELECT id,$1,$2,$3 FROM users WHERE role IN ('dispatcher','admin')",
      [type, message, id],
    );
  }
}
@Global()
@Module({ providers: [Audit], exports: [Audit] })
export class AuditModule {}
