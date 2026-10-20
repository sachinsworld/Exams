# Granth — Academic Preparation Platform

A rebuilt, responsive competitive-exam preparation workspace for UPSC/UPPSC. The project now has separated frontend assets, a native same-origin API adapter, and the original server-side storage layer. The student/admin features and question content from the supplied Granth source are retained while the interface is redesigned around a premium academic assessment experience.

## Architecture

- `server.js` — HTTP server, authentication/session handling, access control, API routes, storage abstraction and backup jobs.
- `public/index.html` — semantic application shell and view mount points.
- `public/css/app.css` — design tokens, responsive layout, component styles and light/dark themes.
- `public/js/app.js` — client application plus `GranthRuntime`, an adapter that connects the app's document/collection contract to the native authenticated REST API.
- Storage supports built-in SQLite on compatible modern Node versions, JSON fallback for local development, or MongoDB when `MONGODB_URI` is configured.

## Run locally

1. Install Node.js 20+ (Node 22+ recommended for built-in SQLite).
2. Copy `.env.example` to `.env` and set secrets as appropriate. Node does not automatically load `.env` in every environment; export variables in your shell or hosting dashboard.
3. Run `npm start` and open `http://localhost:3000`.
4. On first run, create the administrator account through the setup screen. Or set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before startup.

## Database configuration

- Local: `DATA_DIR=./data` uses SQLite when `node:sqlite` is available and otherwise the JSON fallback.
- Hosted: set `MONGODB_URI` and optionally `MONGODB_DB=granth` to use MongoDB Atlas. Install optional dependencies with `npm install` during deployment.
- For SQLite/JSON hosting, mount a persistent disk and set `DATA_DIR` to its mount path.
- Never commit credentials, `data/`, session secrets or backup files.

## Functionality retained

Student: account flow, approval status, dashboard/progress, month-based current affairs, subject-wise and exam-wise practice, timed quizzes, assigned tests, mistake notebook, question bank, flags, account/profile and password changes.

Admin: overview analytics, student management, registration approvals, exam/subject structure, single and bulk question management, question editing/hiding, assigned-test builder, announcements, current-affairs import/generation, database inspection, audit log, backup and restore.

## Validation

Run `npm run check` to syntax-check the server and browser application. Run `npm test` for the automated smoke tests. Manual acceptance testing is still required for first-admin setup, sign-up/approval, student practice, result recording, admin question/test workflows and MongoDB deployment because those workflows require an actual running database and browser session.
