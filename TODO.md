# Apply Best-Practice Corrections

## Information Gathered
- **Index Creation**: Located at the end of `registerRoutes` in `server/routes.ts`, after `initializeDatabase().then(() => { ... })`. Multiple `db.execute(sql\`CREATE INDEX IF NOT EXISTS ... \`)` calls are present.
- **Lazy Cleanup Triggers**: `cleanupExpiredMessages()` is called in three places:
  - `/api/auth/verify` endpoint after successful authentication.
  - WebSocket "join" event.
  - WebSocket "send-message" event.
- All current calls use the time guard: `if (now - lastCleanupTime > 60 * 60 * 1000)`, but lack the database check.
- The `cleanupExpiredMessages` function already checks `if (!hasDatabase || !db) return;`, but the task requires wrapping execution calls with database check.

## Plan
- **A) Await Index Creation**: Move all `CREATE INDEX IF NOT EXISTS` statements into a single async function `ensureIndexes()`, await every `db.execute(...)` call, and call this function exactly once after database initialization.
- **B) Guard Lazy Cleanup**: Wrap all `cleanupExpiredMessages()` calls with `if (hasDatabase && db && now - lastCleanupTime > 60 * 60 * 1000)`.
- **C) Auth Verify Safety**: Ensure cleanup runs only after successful authentication (already the case).

## Dependent Files to be Edited
- `server/routes.ts`: Main file containing index creation and cleanup calls.

## Followup Steps
- [x] Verify changes in `server/routes.ts`.
- [x] Confirm no messages were deleted, no data loss occurred, no user-visible behavior changed.
- [x] Test database initialization and index creation.
- [x] Test cleanup triggers (auth verify, WebSocket join, send-message).
