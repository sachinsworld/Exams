# Exam Management System

Node/Express + MongoDB backend with a vanilla-JS single-page frontend (served by the same Express
app, so there is nothing separate to build or host). Two portals: **Admin** and **Student**.

## Requirements
* Node.js 18+
* MongoDB running locally (`mongodb://localhost:27017`) or a MongoDB Atlas URI

## Setup
```bash
cp .env.example .env            # then edit .env: set JWT_SECRET, MONGODB_URI, admin credentials
cd server
npm install
npm run seed:admin              # creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                     # or: npm start
```
Open http://localhost:5000

Generate a strong secret:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## How it works
* **Sign Up** creates *student* accounts only. Admin accounts come from `npm run seed:admin`
  (public admin sign-up would let anyone take over the platform).
* **Admin:** dashboard stats, activate/deactivate/delete students, subjects, questions
  (4 options, one correct), exams (pick questions of one subject; total marks computed),
  publish / revoke / delete exams, per-exam results.
* **Student:** sees published exams; an exam can be started only inside its window
  (`scheduledDate` to `scheduledDate + duration`). Timer runs from the moment the student starts.
  Questions are sent without correct answers; scoring happens on the server; one attempt per exam.
* Workflow: create subject -> add questions -> create exam (draft) -> **Publish**.

## API summary
| Prefix | Notes |
|---|---|
| `POST /api/auth/register`, `/login`, `/logout`, `GET /me` | login/register rate-limited |
| `/api/admin/*` | admin only: `stats`, `users/students`, `subjects`, `questions`, `exams`, `exams/:id/results` |
| `/api/student/*` | student only: `dashboard`, `exams/available`, `exams/:id/start`, `exams/:id/submit`, `results`, `profile` |

## Production notes
* Serve behind HTTPS and set `NODE_ENV=production`.
* Tokens are stored in `localStorage` (simple, but exposed to XSS; the UI escapes all dynamic
  content). Move to httpOnly cookies if you need stronger protection.
* If you host the frontend on another origin, set `CLIENT_URL` in `.env` and change the
  `fetch('/api' + ...)` base URL in `client/public/js/app.js`.
* Exam timing is enforced server-side (60 s grace on submit); the browser timer is only a display.
