import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import { dataSource } from './data-source';
export const demoId = (group: number, n: number) =>
  `00000000-0000-4000-8${String(group).padStart(3, '0')}-${String(n).padStart(12, '0')}`;
export async function seed() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 12)
    throw new Error('Set DEMO_PASSWORD (at least 12 characters) before seeding');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await dataSource.transaction(async (em) => {
    await em.query('SELECT pg_advisory_xact_lock(731905)');
    if ((await em.query('SELECT id FROM sites LIMIT 1')).length) return;
    const site = demoId(1, 1);
    await em.query(
      "INSERT INTO sites(id,name,timezone) VALUES($1,'Praktika · Riverside','Europe/Vienna')",
      [site],
    );
    const users = [
      ['Anna Smirnova', 'employee', 'anna'],
      ['Mark Volkov', 'dispatcher', 'mark'],
      ['Alex Kim', 'admin', 'alex'],
      ['Elena Belova', 'employee', 'elena'],
    ];
    for (let i = 0; i < users.length; i++)
      await em.query('INSERT INTO users(id,name,role,email,password_hash) VALUES($1,$2,$3,$4,$5)', [
        demoId(2, i + 1),
        users[i][0],
        users[i][1],
        users[i][2] + '@spaceops.demo',
        hash,
      ]);
    const names = ['Orbit', 'Atlas', 'Nova', 'Luna', 'Cosmos', 'Zenith', 'Terra', 'Aurora'];
    for (let floor = 1; floor <= 2; floor++) {
      await em.query('INSERT INTO floors(id,site_id,number,name) VALUES($1,$2,$3,$4)', [
        demoId(3, floor),
        site,
        floor,
        floor === 1 ? 'First floor' : 'Second floor',
      ]);
      for (let room = 0; room < 4; room++) {
        const n = (floor - 1) * 4 + room + 1;
        const space = demoId(4, n);
        await em.query(
          "INSERT INTO spaces(id,floor_id,name,type,capacity,geometry) VALUES($1,$2,$3,'room',$4,$5)",
          [
            space,
            demoId(3, floor),
            names[n - 1],
            [8, 6, 4, 12][room],
            JSON.stringify({ x: 40 + room * 235, y: 45, width: 215, height: 175 }),
          ],
        );
        const categories = ['display', 'whiteboard', ...(room !== 2 ? ['projector'] : [])];
        for (let e = 0; e < categories.length; e++)
          await em.query(
            'INSERT INTO equipment(id,space_id,name,inventory_number,category,state) VALUES($1,$2,$3,$4,$5,$6)',
            [
              demoId(5, n * 10 + e),
              space,
              {
                display: '55″ display',
                whiteboard: 'Whiteboard',
                projector: 'Epson projector',
              }[categories[e]],
              'SP-' + String(n * 10 + e).padStart(4, '0'),
              categories[e],
              n === 4 && e === 2 ? 'broken' : 'working',
            ],
          );
      }
      for (let desk = 1; desk <= 15; desk++) {
        const n = (floor - 1) * 15 + desk;
        await em.query(
          "INSERT INTO spaces(id,floor_id,name,type,capacity,geometry) VALUES($1,$2,$3,'desk',1,$4)",
          [
            demoId(4, 100 + n),
            demoId(3, floor),
            'Desk ' + String(n).padStart(2, '0'),
            JSON.stringify({
              x: 380 + ((desk - 1) % 5) * 110,
              y: 320 + Math.floor((desk - 1) / 5) * 85,
              width: 76,
              height: 50,
            }),
          ],
        );
        if (desk % 3 === 0)
          await em.query(
            'INSERT INTO equipment(space_id,name,inventory_number,category) VALUES($1,$2,$3,$4)',
            [demoId(4, 100 + n), 'Dell 27″ monitor', 'MON-' + n, 'monitor'],
          );
      }
    }
    const today = DateTime.now().setZone('Europe/Vienna').startOf('day');
    for (let day = 0; day < 7; day++)
      for (const [n, hour, length] of [
        [1, 10, 2],
        [2, 14, 1],
        [6, 11, 1],
        [101, 10, 3],
        [104, 9, 4],
      ]) {
        const start = today.plus({ days: day, hours: hour });
        await em.query(
          'INSERT INTO bookings(space_id,user_id,title,starts_at,ends_at,attendees) VALUES($1,$2,$3,$4,$5,$6)',
          [
            demoId(4, n),
            demoId(2, n === 1 ? 1 : 4),
            n > 100 ? 'Focus time' : n === 1 ? 'Product planning' : 'Team meeting',
            start.toISO(),
            start.plus({ hours: length }).toISO(),
            n > 100 ? 1 : 4,
          ],
        );
      }
    const [ticket] = await em.query(
      "INSERT INTO tickets(space_id,equipment_id,author_id,title,description,category,priority) VALUES($1,$2,$3,'Projector will not turn on','The power indicator is blinking and there is no image. Please check the connection.','equipment','high') RETURNING id",
      [demoId(4, 4), demoId(5, 42), demoId(2, 1)],
    );
    await em.query(
      'INSERT INTO availability_blocks(space_id,starts_at,ends_at,reason,author_id) VALUES($1,$2,$3,$4,$5)',
      [
        demoId(4, 4),
        today.toISO(),
        today.plus({ days: 3 }).toISO(),
        'Projector and power supply diagnostics',
        demoId(2, 2),
      ],
    );
    await em.query(
      "INSERT INTO notifications(user_id,type,message,entity_id) VALUES($1,'ticket.created','Your projector issue has been received. A dispatcher will respond soon.',$2)",
      [demoId(2, 1), ticket.id],
    );
    await em.query(
      "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id) VALUES($1,'ticket.created','ticket',$2)",
      [demoId(2, 1), ticket.id],
    );
  });
}
