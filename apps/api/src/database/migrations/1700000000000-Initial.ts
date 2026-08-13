import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1700000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE EXTENSION IF NOT EXISTS btree_gist;
      CREATE TABLE sites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        timezone text NOT NULL, opens_at time NOT NULL DEFAULT '08:00', closes_at time NOT NULL DEFAULT '22:00');
      CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        email text UNIQUE NOT NULL, password_hash text NOT NULL,
        role text NOT NULL CHECK(role IN ('employee','dispatcher','admin')), created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text UNIQUE NOT NULL, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL);
      CREATE INDEX sessions_expiry ON sessions(expires_at);
      CREATE TABLE floors (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL REFERENCES sites(id),
        number integer NOT NULL, name text NOT NULL, UNIQUE(site_id,number));
      CREATE TABLE spaces (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), floor_id uuid NOT NULL REFERENCES floors(id),
        name text NOT NULL UNIQUE, type text NOT NULL CHECK(type IN ('room','desk')), capacity integer NOT NULL CHECK(capacity > 0),
        geometry jsonb NOT NULL, archived boolean NOT NULL DEFAULT false,
        CHECK(type <> 'desk' OR capacity = 1));
      CREATE TABLE equipment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), space_id uuid NOT NULL REFERENCES spaces(id),
        name text NOT NULL, inventory_number text UNIQUE NOT NULL, category text NOT NULL,
        state text NOT NULL DEFAULT 'working' CHECK(state IN ('working','broken','repair')));
      CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), space_id uuid NOT NULL REFERENCES spaces(id),
        user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, comment text NOT NULL DEFAULT '',
        starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, attendees integer NOT NULL CHECK(attendees > 0),
        status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')), needs_relocation boolean NOT NULL DEFAULT false,
        version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
        CHECK(ends_at > starts_at),
        CONSTRAINT bookings_no_overlap EXCLUDE USING gist
        (space_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE(status = 'active'));
      CREATE INDEX bookings_user ON bookings(user_id, starts_at);
      CREATE TABLE booking_requirements (booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        category text NOT NULL, PRIMARY KEY(booking_id,category));
      CREATE TABLE availability_blocks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), space_id uuid NOT NULL REFERENCES spaces(id),
        starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, reason text NOT NULL, author_id uuid NOT NULL REFERENCES users(id),
        released_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at > starts_at));
      CREATE INDEX blocks_space_time ON availability_blocks(space_id, starts_at, ends_at) WHERE released_at IS NULL;
      CREATE TABLE tickets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), space_id uuid NOT NULL REFERENCES spaces(id),
        equipment_id uuid REFERENCES equipment(id), author_id uuid NOT NULL REFERENCES users(id), assignee_id uuid REFERENCES users(id),
        title text NOT NULL, description text NOT NULL, category text NOT NULL,
        priority text NOT NULL CHECK(priority IN ('low','normal','high')), status text NOT NULL DEFAULT 'new'
        CHECK(status IN ('new','in_progress','resolved','closed')), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX tickets_author ON tickets(author_id,created_at);
      CREATE TABLE ticket_comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ticket_id uuid NOT NULL REFERENCES tickets(id),
        author_id uuid NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE relocation_proposals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id),
        space_id uuid NOT NULL REFERENCES spaces(id), author_id uuid NOT NULL REFERENCES users(id), booking_version integer NOT NULL,
        status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','invalidated')),
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX one_pending_proposal ON relocation_proposals(booking_id) WHERE status='pending';
      CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
        type text NOT NULL, message text NOT NULL, entity_id uuid, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX notifications_user ON notifications(user_id,created_at);
      CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES users(id),
        action text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, changes jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX audit_entity ON audit_logs(entity_type, entity_id, created_at);
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'DROP TABLE audit_logs, notifications, relocation_proposals, ticket_comments, tickets, availability_blocks, booking_requirements, bookings, equipment, spaces, floors, sessions, users, sites CASCADE',
    );
  }
}
