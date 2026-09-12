# Backend Instructions

- Follow `docs/BACKEND_ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, and `docs/API_CONTRACT.md`.
- Keep the backend a modular monolith; keep route handlers thin and domain invariants outside routes.
- Centralize Prisma access in the Fastify application context; use migration-first PostgreSQL changes.
- Do not import frontend Pinia types or mock assumptions into backend modules.
- AI is limited to M2/M3/M4 and credentials never belong in source or API responses.
- Add focused tests for each domain phase and keep secrets out of logs and fixtures.
