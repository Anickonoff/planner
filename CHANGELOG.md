# Changelog

## v1.0.0 — Initial stable release

### Added
- Telegram bot with long polling (no webhooks required)
- Event creation from natural text
- Daily reminders and weekly digest
- Deduplication of reminders
- Timezone-aware date handling (UTC storage, local TZ logic)
- REST API for SPA:
  - GET /api/events
  - GET /api/events/:id
  - POST /api/events
  - PUT /api/events/:id
  - DELETE /api/events/:id
- Telegram commands:
  - /help
  - /status
  - /today
  - /tomorrow
  - /week
  - /delete + /confirm + /cancel
- Persistent JSON storage with backups
- File-based logging
- Healthcheck and readiness endpoints
- Docker and docker-compose support

### Fixed
- Incorrect timezone handling when parsing user input
- Incorrect timezone handling during event updates
- Duplicate reminder notifications
- Unsafe event deletion without confirmation

### Notes
- Single shared event list (no authentication)
- One allowed Telegram chat
- JSON storage used as single source of truth
