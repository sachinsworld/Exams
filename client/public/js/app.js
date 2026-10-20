(() => {
'use strict';

/* ------------------------------------------------------------------ state */
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const state = { user: parse(localStorage.getItem('user')), token: localStorage.getItem('token'), timer: null };
const main = document.getElementById('mainContent');
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (d) => new Date(d).toLocaleString();
const spinner = () => { main.innerHTML = '<div class="spinner"></div>'; };

/* -------------------------------------------------------------------- api */
async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-JSON */ }
    if (res.status === 401 && state.token && !path.startsWith('/auth/')) {
        clearSession();
        toast('Session expired. Please sign in again.', 'error');
        location.hash = '#signin';
        const err = new Error('Session expired'); err.silent = true; throw err;
    }
    if (!res.ok) throw new Error(data.message || `Request failed (${res.status})`);
    return data;
}

function toast(message, type = 'info') {
    let wrap = $('.toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
    const el = document.createElement('div');
    el.className = `alert alert-${type}`;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

/* ---------------------------------------------------------------- session */
function saveSession(u) {
    state.user = u; state.token = u.token;
    localStorage.setItem('user', JSON.stringify(u));
    localStorage.setItem('token', u.token);
}
function clearSession() {
    state.user = null; state.token = null;
    localStorage.removeItem('user'); localStorage.removeItem('token');
}
const homeFor = (u) => (u.role === 'admin' ? '#admin/dashboard' : '#student');

function updateNav() {
    const on = !!state.user;
    $('#authLinks').classList.toggle('hidden', on);
    $('#userLinks').classList.toggle('hidden', !on);
    $('#dashLink').classList.toggle('hidden', !on);
    if (on) {
        $('#userName').textContent = state.user.name;
        $('#dashAnchor').setAttribute('href', homeFor(state.user));
    }
}

/* ----------------------------------------------------------------- router */
function need(role) {
    if (!state.user) { location.hash = '#signin'; throw Object.assign(new Error('auth'), { silent: true }); }
    if (state.user.role !== role) { location.hash = homeFor(state.user); throw Object.assign(new Error('role'), { silent: true }); }
}

async function route() {
    clearInterval(state.timer);
    $('#navMenu').classList.remove('active');
    updateNav();
    const [page, a, b] = (location.hash.slice(1) || 'home').split('/');
    try {
        if (page === 'home') main.innerHTML = homeHTML();
        else if (page === 'signin') main.innerHTML = signInHTML();
        else if (page === 'signup') main.innerHTML = signUpHTML();
        else if (page === 'admin') { need('admin'); await renderAdmin(a || 'dashboard', b); }
        else if (page === 'student') { need('student'); await renderStudent(); }
        else if (page === 'practice') { need('student'); await renderPractice(); }
        else if (page === 'exam') { need('student'); await renderExam(a); }
        else main.innerHTML = '<div class="page"><div class="card">Page not found.</div></div>';
    } catch (e) {
        if (!e.silent) { toast(e.message, 'error'); main.innerHTML = `<div class="page"><div class="card">${esc(e.message)}</div></div>`; }
    }
    window.scrollTo(0, 0);
}

/* ------------------------------------------------------------ public pages */
function homeHTML() {
    const cta = state.user
        ? `<a href="${homeFor(state.user)}" class="btn btn-lg">Go to Dashboard</a>`
        : '<a href="#signin" class="btn btn-lg">Sign In</a><a href="#signup" class="btn btn-lg">Sign Up</a>';
    return `
    <section class="hero-section">
        <h1 class="hero-title">Exam Management System</h1>
        <p class="hero-subtitle">Create, schedule and take exams with automatic scoring</p>
        <div>${cta}</div>
    </section>
    <section class="features-section">
        <h2 class="text-center">Features</h2>
        <div class="features-grid">
            <div class="feature-card"><div class="feature-icon">👨‍💻</div><h3 class="feature-title">Admin Portal</h3><p>Manage students, subjects, questions and exams.</p></div>
            <div class="feature-card"><div class="feature-icon">👨‍🎓</div><h3 class="feature-title">Student Portal</h3><p>Take timed exams and review your results.</p></div>
            <div class="feature-card"><div class="feature-icon">🔒</div><h3 class="feature-title">Secure</h3><p>Hashed passwords, JWT auth, server-side scoring.</p></div>
        </div>
    </section>`;
}

const signInHTML = () => `
<div class="page" style="max-width:420px"><div class="card">
    <div class="card-header text-center"><h2 class="card-title">Sign In</h2></div>
    <form data-form="login">
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" name="email" required></div>
        <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" name="password" required></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign In</button>
    </form>
    <p class="text-center mt-2">No account? <a href="#signup">Sign Up</a></p>
</div></div>`;

const signUpHTML = () => `
<div class="page" style="max-width:460px"><div class="card">
    <div class="card-header text-center"><h2 class="card-title">Create Student Account</h2></div>
    <form data-form="register">
        <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" name="name" required maxlength="50"></div>
        <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" name="email" required></div>
        <div class="form-group"><label class="form-label">Enrollment Number</label><input class="form-input" name="enrollmentNumber" placeholder="Optional"></div>
        <div class="form-group"><label class="form-label">Password</label><input type="password" class="form-input" name="password" required minlength="8"><small class="form-hint">Minimum 8 characters</small></div>
        <div class="form-group"><label class="form-label">Confirm Password</label><input type="password" class="form-input" name="confirm" required></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit">Sign Up</button>
    </form>
    <p class="text-center mt-2">Already registered? <a href="#signin">Sign In</a></p>
</div></div>`;

/* ------------------------------------------------------------------ admin */
const ADMIN_TABS = [['dashboard', '📊 Dashboard'], ['signups', '🛂 Sign-up Review'], ['users', '👥 Students'], ['subjects', '📚 Subjects'], ['questions', '❓ Questions'], ['exams', '📝 Exams']];

async function renderAdmin(section, arg) {
    main.innerHTML = `
    <div class="layout">
        <aside class="admin-sidebar">${ADMIN_TABS.map(([k, label]) =>
            `<a class="sidebar-item ${k === section || (section === 'results' && k === 'exams') ? 'active' : ''}" href="#admin/${k}">${label}</a>`).join('')}</aside>
        <section class="admin-content" id="adminContent"><div class="spinner"></div></section>
    </div>`;
    const box = $('#adminContent');
    const view = { dashboard: adminDashboard, signups: adminSignups, users: adminUsers, subjects: adminSubjects, questions: adminQuestions, exams: adminExams, results: adminResults }[section];
    if (!view) { box.innerHTML = '<div class="card">Section not found.</div>'; return; }
    await view(box, arg);
}

const table = (head, rows) => rows.length
    ? `<div class="table-responsive"><table class="table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
    : '<p class="empty">Nothing here yet.</p>';

async function adminDashboard(box) {
    const { data: s } = await api('/admin/stats');
    const card = (v, l) => `<div class="stat-card"><div class="stat-value">${v}</div><div class="stat-label">${l}</div></div>`;
    box.innerHTML = `<h2 style="margin-bottom:1.25rem">Admin Dashboard</h2>
        <div class="dashboard-stats">${card(s.students, 'Students')}${card(s.subjects, 'Subjects')}${card(s.questions, 'Active questions')}${card(s.exams, 'Exams')}${card(s.attempts, 'Submitted attempts')}</div>`;
}

async function adminSignups(box) {
    const { data, count } = await api('/admin/users/pending');
    box.innerHTML = `<div class="card"><div class="card-header"><h3 class="card-title">New Sign-up Requests</h3><span class="badge badge-warning">${count} pending</span></div>
        <p class="form-hint">Review student details before granting access. Approved students can sign in; rejected registrations cannot.</p>${table(
        ['Name', 'Email', 'Enrollment', 'Registered', 'Actions'],
        data.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.enrollmentNumber || '-')}</td><td>${fmt(u.createdAt)}</td><td><div class="table-actions"><button class="btn btn-sm btn-success" data-action="review-signup" data-id="${u._id}" data-decision="approved">Approve</button><button class="btn btn-sm btn-danger" data-action="review-signup" data-id="${u._id}" data-decision="rejected">Reject</button></div></td></tr>`))}</div>`;
}

async function adminUsers(box) {
    const { data } = await api('/admin/users/students');
    box.innerHTML = `<div class="card"><div class="card-header"><h3 class="card-title">Students</h3></div>${table(
        ['Name', 'Email', 'Enrollment', 'Status', 'Last login', 'Actions'],
        data.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.enrollmentNumber || '-')}</td>
            <td><span class="badge ${u.isActive ? 'badge-success' : 'badge-danger'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${u.lastLogin ? fmt(u.lastLogin) : '-'}</td>
            <td><div class="table-actions">
                <button class="btn btn-sm ${u.isActive ? 'btn-warning' : 'btn-success'}" data-action="toggle-user" data-id="${u._id}" data-active="${u.isActive}">${u.isActive ? 'Deactivate' : 'Activate'}</button>
                <button class="btn btn-sm btn-danger" data-action="delete-user" data-id="${u._id}">Delete</button>
            </div></td></tr>`))}</div>`;
}

async function adminSubjects(box) {
    const { data } = await api('/admin/subjects');
    box.innerHTML = `
    <div class="card"><div class="card-header"><h3 class="card-title">Add Subject</h3></div>
        <form data-form="subject">
            <div class="form-row">
                <div class="form-group"><label class="form-label">Name</label><input class="form-input" name="name" required></div>
                <div class="form-group"><label class="form-label">Code</label><input class="form-input" name="code" required></div>
            </div>
            <div class="form-group"><label class="form-label">Description</label><input class="form-input" name="description" maxlength="500"></div>
            <button class="btn btn-primary" type="submit">Add Subject</button>
        </form></div>
    <div class="card"><div class="card-header"><h3 class="card-title">Subjects</h3></div>${table(
        ['Code', 'Name', 'Active questions', 'Description', 'Actions'],
        data.map((s) => `<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td>${s.totalQuestions}</td><td>${esc(s.description || '')}</td>
            <td><button class="btn btn-sm btn-danger" data-action="delete-subject" data-id="${s._id}">Delete</button></td></tr>`))}</div>`;
}

async function adminQuestions(box) {
    const [{ data: subjects }, { data: questions }] = await Promise.all([api('/admin/subjects'), api('/admin/questions')]);
    const opts = subjects.map((s) => `<option value="${s._id}">${esc(s.code)} - ${esc(s.name)}</option>`).join('');
    box.innerHTML = `
    <div class="card"><div class="card-header"><h3 class="card-title">Add Question</h3></div>
        ${subjects.length ? `<form data-form="question">
            <div class="form-group"><label class="form-label">Subject</label><select class="form-select" name="subject" required>${opts}</select></div>
            <div class="form-group"><label class="form-label">Question</label><textarea class="form-textarea" name="question" required></textarea></div>
            <div class="form-row">${['A', 'B', 'C', 'D'].map((l, i) => `<div class="form-group"><label class="form-label">Option ${l}</label><input class="form-input" name="opt${i}" required></div>`).join('')}</div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">Correct option</label><select class="form-select" name="correctOption"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select></div>
                <div class="form-group"><label class="form-label">Marks</label><input type="number" class="form-input" name="marks" value="1" min="0" step="0.5"></div>
                <div class="form-group"><label class="form-label">Difficulty</label><select class="form-select" name="difficulty"><option>easy</option><option selected>medium</option><option>hard</option></select></div>
            </div>
            <button class="btn btn-primary" type="submit">Add Question</button>
        </form>` : '<p class="empty">Create a subject first.</p>'}</div>
    <div class="card"><div class="card-header"><h3 class="card-title">Bulk Import Questions (CSV / JSON)</h3></div>
        <form data-form="question-import">
            <div class="form-row"><div class="form-group"><label class="form-label">Subject</label><select class="form-select" name="subject" required>${opts}</select></div>
            <div class="form-group"><label class="form-label">File format</label><select class="form-select" name="format"><option value="csv">CSV</option><option value="json">JSON</option></select></div></div>
            <div class="form-group"><label class="form-label">Choose file</label><input class="form-input" type="file" name="file" accept=".csv,.json,application/json,text/csv" required></div>
            <p class="form-hint">CSV columns: question, optionA, optionB, optionC, optionD, correctOption (A-D or 0-3), marks, difficulty. JSON accepts an array of objects with question, options, correctOption, marks and difficulty.</p>
            <button class="btn btn-primary" type="submit">Import Questions</button>
        </form></div>
    <div class="card"><div class="card-header"><h3 class="card-title">Questions</h3></div>${table(
        ['Subject', 'Question', 'Answer', 'Marks', 'Level', 'Status', 'Actions'],
        questions.map((q) => `<tr><td>${esc(q.subject?.code || '-')}</td><td>${esc(q.question)}</td>
            <td>${'ABCD'[q.correctOption]}: ${esc(q.options[q.correctOption])}</td><td>${q.marks}</td><td>${esc(q.difficulty)}</td>
            <td><span class="badge ${q.isActive ? 'badge-success' : 'badge-gray'}">${q.isActive ? 'Active' : 'Revoked'}</span></td>
            <td><div class="table-actions">
                ${q.isActive ? `<button class="btn btn-sm btn-warning" data-action="revoke-question" data-id="${q._id}">Revoke</button>` : ''}
                <button class="btn btn-sm btn-danger" data-action="delete-question" data-id="${q._id}">Delete</button>
            </div></td></tr>`))}</div>`;
}

const examBadge = { draft: 'badge-gray', scheduled: 'badge-success', cancelled: 'badge-danger' };

async function adminExams(box) {
    const [{ data: subjects }, { data: exams }] = await Promise.all([api('/admin/subjects'), api('/admin/exams')]);
    box.innerHTML = `
    <div class="card"><div class="card-header"><h3 class="card-title">Create Exam</h3></div>
        ${subjects.length ? `<form data-form="exam">
            <div class="form-row">
                <div class="form-group"><label class="form-label">Title</label><input class="form-input" name="title" required></div>
                <div class="form-group"><label class="form-label">Subject</label><select class="form-select" name="subject" id="examSubject" required><option value="">Select...</option>${subjects.map((s) => `<option value="${s._id}">${esc(s.code)} - ${esc(s.name)}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">Duration (minutes)</label><input type="number" class="form-input" name="duration" min="1" value="30" required></div>
                <div class="form-group"><label class="form-label">Negative marking per wrong answer (fraction of question marks)</label><input type="number" class="form-input" name="negativeMarking" min="0" max="1" step="0.05" value="0"></div>
                <div class="form-group"><label class="form-label">Start date &amp; time</label><input type="datetime-local" class="form-input" name="scheduledDate" required></div>
            </div>
            <div class="form-group"><label class="form-label">Questions</label><label class="opt"><input type="checkbox" id="selectAllExamQuestions"> Select all questions in this subject</label><div class="picker" id="questionPicker"><span class="form-hint">Choose a subject to list its active questions.</span></div></div>
            <div class="form-row"><label class="opt"><input type="checkbox" name="shuffleQuestions" value="true"> Shuffle question order for each student</label></div>
            <div class="form-row"><div class="form-group"><label class="form-label">Question display</label><select class="form-select" name="questionDisplay"><option value="all">All questions on one form</option><option value="one-by-one">One question at a time</option></select></div>
            <div class="form-group"><label class="form-label">Show correct answers</label><select class="form-select" name="answerRelease"><option value="immediate">Immediately after submission</option><option value="after-end" selected>After scheduled exam window ends</option><option value="manual">Only when admin releases them</option></select></div></div>
            <button class="btn btn-primary" type="submit">Create Exam (draft)</button>
        </form>` : '<p class="empty">Create a subject and questions first.</p>'}</div>
    <div class="card"><div class="card-header"><h3 class="card-title">Exams</h3></div>${table(
        ['Title', 'Subject', 'Starts', 'Duration', 'Marks', 'Qs', 'Status', 'Actions'],
        exams.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.subject?.code || '-')}</td><td>${fmt(e.scheduledDate)}</td><td>${e.duration} min</td><td>${e.totalMarks}</td><td>${e.questionCount}</td>
            <td><span class="badge ${examBadge[e.status]}">${e.status}</span></td>
            <td><div class="table-actions">
                ${e.status === 'draft' ? `<button class="btn btn-sm btn-success" data-action="publish-exam" data-id="${e._id}">Publish</button>` : ''}
                ${e.status !== 'cancelled' ? `<button class="btn btn-sm btn-warning" data-action="revoke-exam" data-id="${e._id}">Revoke</button>` : ''}
                ${e.answerRelease === 'manual' ? `<button class="btn btn-sm btn-outline" data-action="release-answers" data-id="${e._id}" data-released="${!!e.answersReleased}">${e.answersReleased ? 'Answers released' : 'Release answers'}</button>` : ''}
                <a class="btn btn-sm btn-outline" href="#admin/results/${e._id}">Results</a>
                <button class="btn btn-sm btn-danger" data-action="delete-exam" data-id="${e._id}">Delete</button>
            </div></td></tr>`))}</div>`;
}

async function adminResults(box, id) {
    const { exam, data } = await api(`/admin/exams/${id}/results`);
    box.innerHTML = `<div class="card"><div class="card-header d-flex justify-between align-center"><h3 class="card-title">Results: ${esc(exam.title)}</h3><a class="btn btn-sm btn-outline" href="#admin/exams">← Back</a></div>${table(
        ['Student', 'Email', 'Enrollment', 'Score', '%', 'Submitted'],
        data.map((a) => `<tr><td>${esc(a.student?.name || '(deleted)')}</td><td>${esc(a.student?.email || '')}</td><td>${esc(a.student?.enrollmentNumber || '-')}</td>
            <td>${a.score} / ${a.totalMarks}</td><td>${a.totalMarks ? ((a.score / a.totalMarks) * 100).toFixed(1) : 0}%</td><td>${fmt(a.submittedAt)}</td></tr>`))}</div>`;
}

/* ---------------------------------------------------------------- student */
async function renderStudent() {
    spinner();
    const [{ data: dash }, { data: exams }, { data: results }] = await Promise.all([
        api('/student/dashboard'), api('/student/exams/available'), api('/student/results')]);
    const stateBadge = { upcoming: 'badge-info', live: 'badge-success' };
    main.innerHTML = `<div class="page">
        <h2 style="margin-bottom:1.25rem">Welcome, ${esc(dash.profile.name)}</h2>
        <div class="dashboard-stats">
            <div class="stat-card"><div class="stat-value">${dash.upcomingExams}</div><div class="stat-label">Open / upcoming exams</div></div>
            <div class="stat-card"><div class="stat-value">${dash.completedExams}</div><div class="stat-label">Completed exams</div></div>
        </div>
        <div class="card"><div class="card-header"><h3 class="card-title">Practice</h3></div><p>Build a practice test from one or more subjects, choose the question count, shuffle questions, or include every available question.</p><a class="btn btn-primary" href="#practice">Start Practice</a></div>
        <div class="card"><div class="card-header"><h3 class="card-title">Available Exams</h3></div>${table(
            ['Title', 'Subject', 'Starts', 'Duration', 'Marks', 'Status', ''],
            exams.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(e.subject?.code || '')}</td><td>${fmt(e.scheduledDate)}</td><td>${e.duration} min</td><td>${e.totalMarks}</td>
                <td><span class="badge ${stateBadge[e.state]}">${e.state}</span></td>
                <td>${e.attempt === 'submitted' ? '<span class="badge badge-gray">Submitted</span>'
                    : e.state === 'live' ? `<a class="btn btn-sm btn-primary" href="#exam/${e._id}">${e.attempt === 'in_progress' ? 'Resume' : 'Start'}</a>` : ''}</td></tr>`))}</div>
        <div class="card"><div class="card-header"><h3 class="card-title">My Results</h3></div>${table(
            ['Exam', 'Subject', 'Score', '%', 'Submitted'],
            results.map((r) => `<tr><td>${esc(r.exam?.title || '(deleted)')}</td><td>${esc(r.exam?.subject?.code || '')}</td><td>${r.score} / ${r.totalMarks}</td>
                <td>${r.totalMarks ? ((r.score / r.totalMarks) * 100).toFixed(1) : 0}%</td><td>${fmt(r.submittedAt)}</td></tr>`))}</div>
    </div>`;
}

async function renderPractice() {
    spinner();
    const { data: subjects } = await api('/student/practice/subjects');
    main.innerHTML = `<div class="page"><div class="card"><div class="card-header"><h2 class="card-title">📝 Practice Test</h2></div>
      <p>Select one or more subjects. Use Select all subjects or Select all questions for a one-tap setup.</p>
      <form data-form="practice">
        <div class="form-row"><button type="button" class="btn btn-secondary" data-action="practice-all-subjects">Select all subjects</button><button type="button" class="btn btn-secondary" data-action="practice-clear-subjects">Clear selection</button></div>
        <div class="form-group"><label class="form-label">Subjects</label><div class="picker" id="practiceSubjects">${subjects.map(s => `<label class="opt"><input type="checkbox" name="subjects" value="${s._id}"> ${esc(s.code)} - ${esc(s.name)} (${s.totalQuestions || 0} questions)</label>`).join('')}</div></div>
        <div class="form-row"><div class="form-group"><label class="form-label">Question count</label><input class="form-input" type="number" name="limit" min="1" max="500" value="25"></div><div class="form-group"><label class="form-label">Timer (minutes, 0 = untimed)</label><input class="form-input" type="number" name="duration" min="0" max="180" value="0"></div></div>
        <label class="opt"><input type="checkbox" name="selectAll" value="true"> Select all questions from selected subjects</label>
        <label class="opt"><input type="checkbox" name="shuffle" value="true" checked> Shuffle questions</label>
        <button class="btn btn-primary btn-lg" type="submit">Create Practice Test</button>
      </form></div><div id="practiceQuestions"></div></div>`;
}

async function renderExam(id) {
    spinner();
    // Student-level settings are saved with the attempt; resuming an attempt keeps its original settings.
    const durationInput = prompt('Exam duration in minutes (1-180). Leave blank to use the exam default:', '');
    const duration = durationInput && durationInput.trim() ? Number(durationInput) : undefined;
    if (durationInput && (!Number.isFinite(duration) || duration < 1 || duration > 180)) throw new Error('Duration must be between 1 and 180 minutes');
    const penaltyInput = prompt(
        "Choose your negative marking penalty as a percentage of each question\'s marks (0-100).\n" +
        'Examples: 0 = no penalty, 25 = minus 25%, 100 = minus the full question marks.',
        '0'
    );
    if (penaltyInput === null) {
        main.innerHTML = '<div class="page"><div class="alert alert-info">Exam start cancelled. You can configure your settings and start again.</div></div>';
        return;
    }
    const penaltyPercent = Number(penaltyInput);
    if (!Number.isFinite(penaltyPercent) || penaltyPercent < 0 || penaltyPercent > 100) {
        throw new Error('Negative marking must be a percentage between 0 and 100');
    }
    // The API stores the penalty as a fraction: 25% is represented as 0.25.
    const negativeMarking = penaltyPercent / 100;
    const shuffleQuestions = confirm('Shuffle question order for this attempt?');
    const { data } = await api(`/student/exams/${id}/start`, { method: 'POST', body: { duration, negativeMarking, shuffleQuestions } });
    const skew = Date.now() - new Date(data.serverTime).getTime();           // client-vs-server clock offset
    const deadline = new Date(data.deadline).getTime() + skew;
    main.innerHTML = `<div class="page">
        <div class="exam-bar"><div><strong>${esc(data.title)}</strong><div class="form-hint">${data.questions.length} questions · ${data.totalMarks} marks</div></div><div class="timer" id="timer">--:--</div></div>
        <form data-form="submit-exam" data-exam="${esc(data.examId)}">
            <div id="examQuestionArea">${data.questions.map((q, i) => `<div class="q-block exam-question" data-q-index="${i}" ${data.questionDisplay === 'one-by-one' && i > 0 ? 'hidden' : ''}><strong>Q${i + 1}. ${esc(q.question)}</strong> <span class="form-hint">(${q.marks} mark${q.marks === 1 ? '' : 's'})</span>
                ${q.options.map((o, k) => `<label class="opt"><input type="radio" name="${esc(q._id)}" value="${k}"> ${'ABCD'[k]}. ${esc(o)}</label>`).join('')}</div>`).join('')}</div>
            ${data.questionDisplay === 'one-by-one' ? '<div class="form-row"><button class="btn btn-secondary" type="button" data-action="exam-prev">Previous</button><span id="examStep" class="form-hint">Question 1</span><button class="btn btn-secondary" type="button" data-action="exam-next">Next</button></div>' : ''}
            <button class="btn btn-primary btn-lg" type="submit">Submit Exam</button>
        </form></div>`;
    const timerEl = $('#timer');
    const tick = () => {
        const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
        timerEl.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
        timerEl.classList.toggle('low', left <= 60);
        if (left === 0) { clearInterval(state.timer); toast('Time is up. Submitting...', 'info'); submitExam($('form[data-form="submit-exam"]'), true); }
    };
    tick();
    state.timer = setInterval(tick, 1000);
}

async function submitExam(form, auto = false) {
    if (!form || form.dataset.busy) return;
    if (!auto && !confirm('Submit your answers? You cannot change them afterwards.')) return;
    form.dataset.busy = '1';
    clearInterval(state.timer);
    const answers = {};
    form.querySelectorAll('input[type=radio]:checked').forEach((r) => { answers[r.name] = Number(r.value); });
    try {
        const { data } = await api(`/student/exams/${form.dataset.exam}/submit`, { method: 'POST', body: { answers } });
        main.innerHTML = `<div class="page">
            <div class="card text-center"><h2>Result</h2><div class="stat-value" style="font-size:3rem">${data.score} / ${data.totalMarks}</div><p>${data.percentage}%</p>
                <a class="btn btn-primary mt-2" href="#student">Back to dashboard</a></div>
            ${data.answersVisible ? data.results.map((r, i) => `<div class="q-block"><strong>Q${i + 1}. ${esc(r.question)}</strong>
                ${r.options.map((o, k) => `<div class="opt ${k === r.correctOption ? 'correct' : k === r.selected ? 'wrong' : ''}">${'ABCD'[k]}. ${esc(o)}${k === r.selected ? ' (your answer)' : ''}</div>`).join('')}</div>`).join('') : '<div class="card"><p>Answer key is not available yet. The administrator controls when correct answers are released.</p></div>'}</div>`;
    } catch (e) {
        delete form.dataset.busy;
        if (!e.silent) toast(e.message, 'error');
    }
}

/* ------------------------------------------------- delegated form handlers */
const formHandlers = {
    async login(f) {
        const d = Object.fromEntries(new FormData(f));
        const { data } = await api('/auth/login', { method: 'POST', body: d });
        saveSession(data); toast('Login successful', 'success'); location.hash = homeFor(data);
    },
    async register(f) {
        const d = Object.fromEntries(new FormData(f));
        if (d.password !== d.confirm) throw new Error('Passwords do not match');
        delete d.confirm;
        const result = await api('/auth/register', { method: 'POST', body: d });
        toast(result.message || 'Registration submitted for review', 'success');
        main.innerHTML = `<div class="page"><div class="card"><h2>Registration submitted</h2><p>Your account is awaiting administrator review. You can sign in after it is approved.</p><a class="btn btn-primary" href="#signin">Go to Sign In</a></div></div>`;
    },
    async subject(f) {
        await api('/admin/subjects', { method: 'POST', body: Object.fromEntries(new FormData(f)) });
        toast('Subject added', 'success'); await route();
    },
    async 'question-import'(f) {
        const file = f.querySelector('input[type="file"]').files[0];
        if (!file) throw new Error('Choose a CSV or JSON file first');
        const format = f.elements.format.value;
        const content = await file.text();
        const { data, count } = await api('/admin/questions/import', { method: 'POST', body: { subject: f.elements.subject.value, format, content } });
        toast(data?.message || `Imported ${count} questions`, 'success'); await route();
    },
    async question(f) {
        const d = Object.fromEntries(new FormData(f));
        const body = { subject: d.subject, question: d.question, options: [d.opt0, d.opt1, d.opt2, d.opt3],
                       correctOption: Number(d.correctOption), marks: Number(d.marks), difficulty: d.difficulty };
        await api('/admin/questions', { method: 'POST', body });
        toast('Question added', 'success'); await route();
    },
    async exam(f) {
        const d = Object.fromEntries(new FormData(f));
        const questions = [...f.querySelectorAll('#questionPicker input:checked')].map((i) => i.value);
        await api('/admin/exams', { method: 'POST', body: {
            title: d.title, subject: d.subject, duration: Number(d.duration), negativeMarking: Number(d.negativeMarking || 0),
            shuffleQuestions: f.elements.shuffleQuestions.checked, questionDisplay: d.questionDisplay, answerRelease: d.answerRelease,
            scheduledDate: new Date(d.scheduledDate).toISOString(), questions } });
        toast('Exam created as draft. Publish it to make it visible to students.', 'success'); await route();
    },
    async 'submit-exam'(f) { await submitExam(f); },
    async practice(f) {
        const subjects = [...f.querySelectorAll('input[name=subjects]:checked')].map(x => x.value);
        const { data: qs } = await api('/student/practice/questions', { method: 'POST', body: { subjects, limit: Number(f.elements.limit.value || 25), selectAll: f.elements.selectAll.checked, shuffle: f.elements.shuffle.checked } });
        const target = $('#practiceQuestions');
        target.innerHTML = `<div class="card"><h3>Practice questions (${qs.length})</h3><form data-form="practice-submit">${qs.map((q,i)=>`<div class="q-block"><strong>Q${i+1}. ${esc(q.question)}</strong><span class="form-hint"> ${esc(q.subject?.name || '')} · ${q.marks} mark(s)</span>${q.options.map((o,k)=>`<label class="opt"><input type="radio" name="q_${q._id}" value="${k}"> ${'ABCD'[k]}. ${esc(o)}</label>`).join('')}<div class="practice-feedback" data-correct="${q.correctOption}" hidden></div></div>`).join('')}<button class="btn btn-primary" type="submit">Check Answers</button></form></div>`;
        state.practiceQuestions = qs;
        if (Number(f.elements.duration.value) > 0) { let left = Number(f.elements.duration.value)*60; const timer = document.createElement('div'); timer.className='alert alert-info'; timer.id='practiceTimer'; timer.textContent=`Practice time: ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`; target.prepend(timer); state.timer=setInterval(()=>{left--; if(left<=0){clearInterval(state.timer); const form=target.querySelector('form[data-form=practice-submit]'); if(form) form.requestSubmit(); return;} timer.textContent=`Practice time: ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;},1000); }
        target.scrollIntoView({behavior:'smooth'});
    },
    async 'practice-submit'(f) { const qs=state.practiceQuestions||[]; let score=0, answered=0; qs.forEach((q,i)=>{const picked=f.querySelector(`input[name="q_${q._id}"]:checked`); const feedback=f.querySelectorAll('.practice-feedback')[i]; feedback.hidden=false; if(!picked){feedback.textContent='Unanswered';return;} answered++; const correct=Number(picked.value)===q.correctOption; if(correct) score+=Number(q.marks||1); feedback.textContent=correct?'Correct ✓':`Incorrect. Correct answer: ${'ABCD'[q.correctOption]}. ${q.options[q.correctOption]}`;}); toast(`Practice complete: ${score} marks; ${answered}/${qs.length} answered`, 'success'); f.querySelector('button[type=submit]').disabled=true; }
};

document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    const btn = f.querySelector('button[type=submit]');
    if (btn) btn.disabled = true;
    try { await formHandlers[f.dataset.form](f); }
    catch (err) { if (!err.silent) toast(err.message, 'error'); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
});

/* ------------------------------------------------- delegated click handlers */
const act = {
    'practice-all-subjects': () => { document.querySelectorAll('#practiceSubjects input[type=checkbox]').forEach(x=>x.checked=true); },
    'practice-clear-subjects': () => { document.querySelectorAll('#practiceSubjects input[type=checkbox]').forEach(x=>x.checked=false); },
    'exam-prev': () => { const qs=[...document.querySelectorAll('.exam-question')]; let i=qs.findIndex(q=>!q.hidden); if(i>0){qs[i].hidden=true;qs[i-1].hidden=false;$('#examStep').textContent=`Question ${i}`;} },
    'exam-next': () => { const qs=[...document.querySelectorAll('.exam-question')]; let i=qs.findIndex(q=>!q.hidden); if(i<qs.length-1){qs[i].hidden=true;qs[i+1].hidden=false;$('#examStep').textContent=`Question ${i+2}`;} },
    'release-answers': async (id, el) => { await api(`/admin/exams/${id}`, {method:'PUT', body:{answersReleased:el.dataset.released !== 'true'}}); toast(el.dataset.released === 'true' ? 'Answer release disabled' : 'Correct answers released', 'success'); await route(); },
    logout: async () => {
        try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
        clearSession(); toast('Logged out', 'success'); location.hash = '#home'; await route();
    },
    'toggle-user': (id, el) => api(`/admin/users/${id}`, { method: 'PATCH', body: { isActive: el.dataset.active !== 'true' } }),
    'review-signup': async (id, el) => { if (confirm(`${el.dataset.decision === 'approved' ? 'Approve' : 'Reject'} this student registration?`)) { await api(`/admin/users/${id}/review`, { method: 'PATCH', body: { decision: el.dataset.decision } }); toast(`Registration ${el.dataset.decision}`, 'success'); await route(); } },
    'delete-user': (id) => confirm('Permanently delete this student and their attempts?') && api(`/admin/users/${id}`, { method: 'DELETE' }),
    'delete-subject': (id) => confirm('Delete this subject?') && api(`/admin/subjects/${id}`, { method: 'DELETE' }),
    'revoke-question': (id) => confirm('Revoke this question? It can no longer be added to exams.') && api(`/admin/questions/${id}/revoke`, { method: 'PATCH' }),
    'delete-question': (id) => confirm('Delete this question permanently?') && api(`/admin/questions/${id}`, { method: 'DELETE' }),
    'publish-exam': (id) => api(`/admin/exams/${id}/publish`, { method: 'PATCH' }),
    'revoke-exam': (id) => confirm('Revoke (cancel) this exam?') && api(`/admin/exams/${id}/revoke`, { method: 'PATCH' }),
    'delete-exam': (id) => confirm('Delete this exam and all its attempts permanently?') && api(`/admin/exams/${id}`, { method: 'DELETE' })
};

document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const fn = act[el.dataset.action];
    if (!fn) return;
    try {
        const res = await fn(el.dataset.id, el);
        if (res && res.message) { toast(res.message, 'success'); await route(); }
    } catch (err) { if (!err.silent) toast(err.message, 'error'); }
});

document.addEventListener('change', (e) => { if (e.target.id === 'selectAllExamQuestions') document.querySelectorAll('#questionPicker input[type=checkbox]').forEach(x => x.checked = e.target.checked); });

// Load the active questions of the chosen subject into the exam form
document.addEventListener('change', async (e) => {
    if (e.target.id !== 'examSubject') return;
    const picker = $('#questionPicker');
    if (!e.target.value) { picker.innerHTML = '<span class="form-hint">Choose a subject to list its active questions.</span>'; return; }
    try {
        const { data } = await api(`/admin/questions?subject=${encodeURIComponent(e.target.value)}&isActive=true`);
        picker.innerHTML = data.length
            ? data.map((q) => `<label><input type="checkbox" value="${q._id}"> <span>${esc(q.question)} <span class="form-hint">(${q.marks} mark${q.marks === 1 ? '' : 's'}, ${esc(q.difficulty)})</span></span></label>`).join('')
            : '<span class="form-hint">This subject has no active questions.</span>';
    } catch (err) { if (!err.silent) toast(err.message, 'error'); }
});

/* --------------------------------------------------------------------- init */
$('#menuToggle').addEventListener('click', () => $('#navMenu').classList.toggle('active'));
$('#year').textContent = new Date().getFullYear();
window.addEventListener('hashchange', route);
route();
})();
