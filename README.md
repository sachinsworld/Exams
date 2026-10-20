# Exam Management System

Node/Express + MongoDB backend with a vanilla-JS frontend served by the same app.
Admin and Student portals. Optional Streamlit analytics dashboard (`dashboard.py`).

## Deploy: MongoDB Atlas + Render

### 1. MongoDB Atlas
1. Create a free cluster (M0).
2. **Database Access** -> Add user (username + password, role *Read and write to any database*).
   Avoid special characters in the password, or URL-encode them.
3. **Network Access** -> Add IP address -> **Allow access from anywhere (0.0.0.0/0)**.
   (Render's free plan has no fixed IP.)
4. **Connect -> Drivers** -> copy the connection string and put your password in it:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

### 2. Render
1. Push this project to GitHub (`.env` is git-ignored; never commit secrets).
2. Render -> **New + -> Blueprint** -> pick the repo (it reads `render.yaml`).
   Or **New + -> Web Service** manually with: Root Directory `server`, Build `npm install`, Start `npm start`.
3. Set the environment variables Render asks for:
   * `MONGODB_URI` - the Atlas string from step 1
   * `ADMIN_EMAIL`, `ADMIN_PASSWORD` (8+ chars), `ADMIN_NAME` - your first admin
   * `JWT_SECRET` is generated automatically (if creating manually, set a long random value)
4. Deploy. In the logs you should see `MongoDB connected (database: exam_management)` and
   `First admin created`. Open the Render URL and sign in with the admin credentials.
5. **Afterwards delete `ADMIN_PASSWORD`** from Render's environment variables.

The first admin is created automatically at startup only when no admin exists. It never overwrites
accounts. Public sign-up creates student accounts in a pending state. An administrator must approve each new registration from **Admin Portal → Sign-up Review** before the student can sign in. Rejected registrations cannot sign in. Students can also choose their own negative-marking percentage when starting an exam; the choice is stored on that attempt.

Notes: the free Render plan sleeps after inactivity (first request takes ~30-60 s).
Health check: `/health`.

### 3. Streamlit dashboard (optional)
Main file `dashboard.py`; secrets (Streamlit Cloud -> Settings -> Secrets):
```toml
MONGODB_URI = "mongodb+srv://READONLY_USER:PASSWORD@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
MONGODB_DB = "exam_management"
```
Use a separate **read-only** Atlas user and restrict who can view the app (it shows student data).

## Run locally
```bash
cp .env.example .env       # edit values (local MongoDB or Atlas)
cd server && npm install && npm run dev    # http://localhost:5000
```
`npm run seed:admin` creates the admin manually (the same logic also runs at startup).

## How it works
* **Admin:** stats, activate/deactivate/delete students, subjects, questions (4 options),
  exams (draft -> Publish), revoke/delete, per-exam results.
* **Student:** starts a published exam inside its time window; server-side timer and scoring;
  one attempt per exam; correct answers are revealed only after submission.
* Workflow: subject -> questions -> exam (draft) -> **Publish**.

## API summary
`/api/auth/*` (rate-limited), `/api/admin/*` (admin only), `/api/student/*` (student only), `/health`.

## Production notes
* Tokens live in `localStorage`; the UI escapes dynamic content. Use httpOnly cookies for stronger protection.
* Timing is enforced on the server (60 s grace on submit); the browser timer is display only.


## Added question import and student exam controls

### Bulk question import
Sign in as an admin, open **Questions**, choose a subject, and upload a `.csv` or `.json` file.
CSV headers: `question,optionA,optionB,optionC,optionD,correctOption,marks,difficulty`.
`correctOption` accepts `A`-`D` or `0`-`3`. JSON may be an array or `{ "questions": [...] }`; each item accepts `question`, `options` (four strings), `correctOption`, `marks`, and `difficulty`. Imports are limited to 2,000 questions per request and validate the whole batch before inserting.

Example JSON item:
```json
{
  "question": "What is 2 + 2?",
  "options": ["2", "3", "4", "5"],
  "correctOption": "C",
  "marks": 1,
  "difficulty": "easy"
}
```

### Exam controls
Admins can configure a default negative-marking fraction and shuffle question order on the exam creation form. Students can also choose their attempt duration (1-180 minutes), negative-marking fraction (0-1 of the question's marks), and whether to shuffle question order when starting an exam. These choices are stored on the attempt, so resuming uses the same settings. A wrong answered question loses `question marks × negative-marking fraction`; unanswered questions are not penalized. Scores are floored at zero.
