# SpaceOps

[![Checks](https://github.com/vitoriofedorov15/spaceops/actions/workflows/ci.yml/badge.svg)](https://github.com/vitoriofedorov15/spaceops/actions/workflows/ci.yml)

An office and coworking management platform with an interactive floor plan, room and desk bookings, support tickets, and meeting relocation approved by the booking owner.

**React 19 · Vite · NestJS 11 · PostgreSQL 17 · TypeScript**

The monorepo includes the web application, REST API, database migrations, demo data, Docker Compose, and a GitHub Actions pipeline. The client uses a real API backed by PostgreSQL. The interface and this README are in English; the detailed documentation in `docs/` is in Russian.

The responsive interface uses compact navigation, neutral surfaces, subtle borders, and a single purple accent.

![SpaceOps — floor plan](docs/screenshots/floor-plan-desktop.png)

[Mobile preview](docs/screenshots/floor-plan-mobile.png) · [Verification report: 37 tests](docs/VERIFICATION.md)

## Quick start with Docker

Requirements: Docker Engine or Docker Desktop with Compose, and an available port **8080**. PostgreSQL also binds to `127.0.0.1:5432` for local development.

```bash
git clone https://github.com/vitoriofedorov15/spaceops.git
cd spaceops
cp .env.example .env
docker compose --env-file .env -f infra/compose.yaml up --build -d
```

Check that the services are ready:

```bash
docker compose --env-file .env -f infra/compose.yaml ps
```

- Application: http://localhost:8080
- Swagger UI: http://localhost:8080/api/docs
- API and database health: http://localhost:8080/api/v1/health

The `migrate` service applies migrations and seeds demo data once. Subsequent starts preserve existing records. TypeORM schema synchronization is disabled. Seeding does not reset the database or change existing users' passwords.

### Demo accounts

| Role            | Email                 |
| --------------- | --------------------- |
| Employee        | `anna@spaceops.demo`  |
| Second employee | `elena@spaceops.demo` |
| Dispatcher      | `mark@spaceops.demo`  |
| Administrator   | `alex@spaceops.demo`  |

On the first seed, all demo accounts use `DEMO_PASSWORD` from `.env`. The example value is **`SpaceOps-demo-2026!`**. Change demo credentials and the database password before a public deployment. Updating `.env` after seeding does not change passwords already stored in the database.

The demo site, Praktika · Riverside, has two floors, eight meeting rooms, and 30 desks. Its timezone is **Europe/Vienna**, with opening hours **08:00–22:00 every day**. Seed data includes bookings for the next seven days.

## Features

- **Authentication:** server-side sessions, Argon2id password hashing, a random token in an HttpOnly cookie, and a SHA-256 token hash stored in the database. Session-bound CSRF tokens, exact Origin checks, and login rate limiting protect authentication flows.
- **Access control:** employee, dispatcher, and administrator roles are enforced on the server. Other employees' bookings expose availability without private titles, comments, or equipment requirements.
- **Floor plan:** a zoomable SVG plan and list view with search, time filters, capacity, working equipment, space details, and daily schedules.
- **Bookings:** create, edit, and cancel your own bookings; view the FullCalendar schedule; review a confirmation step before saving. Conflicts preserve the completed form.
- **Equipment and spaces:** browse equipment, update its condition, add equipment, edit space properties, and archive spaces.
- **Support tickets:** assignments, controlled status transitions, comments, and history. Reopening a closed ticket requires a comment.
- **Meeting relocation:** restrict space availability, identify affected meetings, find alternatives, and let the booking owner accept or decline a relocation proposal.
- **Notifications:** in-app notifications with 30-second polling and immediate query invalidation after changes.
- **Analytics:** weekly or monthly booking utilization, excluding restricted periods and correctly merging overlapping restrictions.
- **Responsive layout:** desktop and mobile interfaces; mobile devices default to the space list.

## Booking consistency and concurrency

PostgreSQL enforces an `EXCLUDE USING gist` constraint on `space_id` and `tstzrange(starts_at, ends_at, '[)')` for active bookings. Overlaps are rejected even for direct SQL inserts that bypass the API. Half-open intervals allow adjacent bookings.

Booking creation and updates, availability restrictions, restriction removal, and relocation acceptance first lock the same space row with `SELECT … FOR UPDATE`. When multiple spaces are involved, rows are locked in UUID order. The server then checks availability again inside the transaction, preventing races between booking requests and availability restrictions.

A relocation proposal does not reserve the destination. Acceptance rechecks the space type, capacity, working equipment, restrictions, overlaps, and the original booking version. The booking, proposal, audit records, and notifications are updated atomically.

See the [architecture and transaction notes](docs/ARCHITECTURE.md) for details.

## Tech stack

| Layer                 | Technologies                                         |
| --------------------- | ---------------------------------------------------- |
| Web                   | React 19, TypeScript, Vite, React Router             |
| UI                    | Tailwind CSS, Radix UI, Lucide icons                 |
| Client data and forms | TanStack Query, React Hook Form, Zod                 |
| Calendar and charts   | FullCalendar, Recharts                               |
| API                   | NestJS 11, REST, Swagger / OpenAPI                   |
| Persistence           | PostgreSQL 17, TypeORM, explicit SQL migrations      |
| Tests                 | Jest, Vitest, Testing Library, Supertest, Playwright |
| Delivery              | Docker Compose, nginx, GitHub Actions                |

## Local development

Requirements: **Node.js 22.12+**, npm, and Docker. Node.js 22 is recommended.

```bash
cp .env.example .env
npm ci
docker compose --env-file .env -f infra/compose.yaml up -d db
npm run db:migrate
npm run db:seed
PUBLIC_URL=http://localhost:5173 npm run dev
```

Open **http://localhost:5173**. Swagger is available at **http://localhost:3001/api/docs**.

Use `localhost`, not `127.0.0.1`: the browser Origin must exactly match `PUBLIC_URL`. Vite proxies `/api` to NestJS so the browser uses a single origin.

The local API and the full Compose stack share the database exposed on port 5432 unless configured otherwise. Use a separate database when you need an independent environment. The API container's port 3001 is not exposed to the host.

## Checks and tests

```bash
npm run typecheck
npm test
npm run build
npm run format:check
```

The verified suite contains **37 tests**: eight API unit tests, ten web unit tests, 17 PostgreSQL integration tests, and two desktop/mobile end-to-end tests. GitHub Actions runs formatting, type checking, unit tests, production builds, integration tests, and browser tests.

### PostgreSQL integration tests

Integration tests use a **dedicated real PostgreSQL database**, reset its application tables before each test, and refuse to run unless the database name ends in `_test`.

Create the test database once:

```bash
docker compose --env-file .env -f infra/compose.yaml exec db createdb -U spaceops spaceops_test
DATABASE_URL=postgres://spaceops:spaceops_local@localhost:5432/spaceops_test npm run test:integration
```

If you changed the PostgreSQL password in `.env`, substitute it in the test connection URL.

### End-to-end tests

Playwright starts its own API on **3002** and Vite on **5174**. Desktop and mobile Chromium cover booking, ticket creation, availability restrictions, relocation proposals, owner confirmation, history, and cancellation.

```bash
npx playwright install chromium
DATABASE_URL=postgres://spaceops:spaceops_local@localhost:5432/spaceops_test \
DEMO_PASSWORD=SpaceOps-test-2026! npm run test:e2e
```

E2E setup applies migrations, seeds demo data, and fully resets the dedicated test database's demo data before each run. The database name must end in `_test`; the application database must not be used. Create the test database with the command above. Integration tests can also be run independently.

### Browser tests in a Linux container

If browser execution is restricted on the host, use the image with Node.js and a single system Chromium. It does not download Firefox or WebKit. Create `spaceops_test` first and check available Docker disk space before building. E2E setup handles migrations and test data.

```bash
docker build -f infra/Dockerfile.e2e -t spaceops-e2e .
docker run --rm --network spaceops_default \
  -e DATABASE_URL=postgres://spaceops:spaceops_local@db:5432/spaceops_test \
  -e DEMO_PASSWORD=SpaceOps-test-2026! spaceops-e2e
```

Substitute your PostgreSQL password if needed.

### Production frontend smoke check

After starting the application:

```bash
SMOKE_URL=http://localhost:8080 npm run test:smoke
```

This opens the login page and verifies that the production JavaScript works. It does not sign in or create records. Install Playwright Chromium first, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a system browser.

The Linux image already includes Chromium:

```bash
docker run --rm --network spaceops_default \
  -e SMOKE_URL=http://web --entrypoint npm spaceops-e2e run test:smoke
```

## Repository structure

```text
apps/web/      React routes, forms, SVG floor plan, calendar, charts
apps/api/      NestJS: Auth, Users, Spaces, Bookings, Equipment,
               Tickets, Relocations, Notifications, Analytics, Audit
infra/         Dockerfile, Compose, nginx
.github/       GitHub Actions
e2e/           Playwright desktop and mobile workflows
docs/          Specification, architecture, database, demo, limitations
```

Detailed documentation is currently in Russian:

- [Original specification](docs/SPEC.md)
- [Architecture and transactions](docs/ARCHITECTURE.md)
- [Data model](docs/DATABASE.md)
- [API and request examples](docs/API.md)
- [Demo walkthrough](docs/DEMO.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Known limitations](docs/LIMITATIONS.md)
- [Verification report](docs/VERIFICATION.md)

## Deployment

Docker Compose provides the API, PostgreSQL, migrations, and an nginx frontend. Instructions for your own server are in [DEPLOYMENT.md](docs/DEPLOYMENT.md). Public hosting and a demo video are separate steps; this repository does not imply a hosted public instance.

Local `.env` files, dependencies, build output, and test artifacts are excluded through `.gitignore`.

## License

[MIT](LICENSE).
