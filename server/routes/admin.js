const express = require('express');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Question = require('../models/Question');
const Exam = require('../models/Exam');
const Attempt = require('../models/Attempt');
const { protect, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError, pick } = require('../utils/http');

const router = express.Router();

// Minimal CSV parser supporting quoted fields and escaped double quotes.
function parseCSV(text) {
    const rows = []; let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '"' && quoted && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = !quoted;
        else if (c === ',' && !quoted) { row.push(field); field = ''; }
        else if ((c === '\n' || c === '\r') && !quoted) {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); if (row.some(v => v.trim())) rows.push(row); row = []; field = '';
        } else field += c;
    }
    row.push(field); if (row.some(v => v.trim())) rows.push(row);
    if (!rows.length) return [];
    const headers = rows.shift().map(h => h.trim().toLowerCase());
    return rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] || '').trim()])));
}
router.use(protect, authorize('admin'));

const syncSubjectCount = async (subjectId) => {
    const n = await Question.countDocuments({ subject: subjectId, isActive: true });
    await Subject.findByIdAndUpdate(subjectId, { totalQuestions: n });
};

const loadStudent = async (id) => {
    const u = await User.findOne({ _id: id, role: 'student' });
    if (!u) throw new HttpError(404, 'Student not found');
    return u;
};

// ============ DASHBOARD ============
router.get('/stats', asyncHandler(async (req, res) => {
    const [students, subjects, questions, exams, attempts] = await Promise.all([
        User.countDocuments({ role: 'student' }),
        Subject.countDocuments(),
        Question.countDocuments({ isActive: true }),
        Exam.countDocuments(),
        Attempt.countDocuments({ submittedAt: { $exists: true } })
    ]);
    res.json({ success: true, data: { students, subjects, questions, exams, attempts } });
}));

// ============ SIGN-UP REVIEW ============
router.get('/users/pending', asyncHandler(async (req, res) => {
    const users = await User.find({ role: 'student', approvalStatus: 'pending' })
        .select('-password').sort({ createdAt: 1 });
    res.json({ success: true, count: users.length, data: users });
}));

router.patch('/users/:id/review', asyncHandler(async (req, res) => {
    const decision = String(req.body.decision || '').toLowerCase();
    if (!['approved', 'rejected'].includes(decision)) {
        throw new HttpError(400, 'Decision must be approved or rejected');
    }
    const user = await User.findOne({ _id: req.params.id, role: 'student' });
    if (!user) throw new HttpError(404, 'Student registration not found');
    user.approvalStatus = decision;
    user.reviewedAt = new Date();
    user.reviewedBy = req.user._id;
    user.isActive = decision === 'approved';
    await user.save();
    res.json({ success: true, message: `Student registration ${decision}`, data: { _id: user._id, approvalStatus: user.approvalStatus, isActive: user.isActive } });
}));

// ============ USERS (students) ============
router.get('/users/students', asyncHandler(async (req, res) => {
    const students = await User.find({ role: 'student', approvalStatus: { $ne: 'pending' } }).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: students.length, data: students });
}));

router.patch('/users/:id', asyncHandler(async (req, res) => {
    const user = await loadStudent(req.params.id);
    user.isActive = typeof req.body.isActive === 'boolean' ? req.body.isActive : !user.isActive;
    await user.save();
    res.json({
        success: true,
        message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
        data: { _id: user._id, isActive: user.isActive }
    });
}));

router.delete('/users/:id', asyncHandler(async (req, res) => {
    const user = await loadStudent(req.params.id);
    await Attempt.deleteMany({ student: user._id });
    await user.deleteOne();
    res.json({ success: true, message: 'User deleted permanently' });
}));

// ============ SUBJECTS ============
router.post('/subjects', asyncHandler(async (req, res) => {
    const subject = await Subject.create({
        ...pick(req.body, ['name', 'code', 'description']),
        createdBy: req.user._id
    });
    res.status(201).json({ success: true, message: 'Subject created successfully', data: subject });
}));

router.get('/subjects', asyncHandler(async (req, res) => {
    const subjects = await Subject.find().populate('createdBy', 'name email').sort({ createdAt: -1 });
    res.json({ success: true, count: subjects.length, data: subjects });
}));

router.put('/subjects/:id', asyncHandler(async (req, res) => {
    const subject = await Subject.findByIdAndUpdate(
        req.params.id,
        pick(req.body, ['name', 'code', 'description', 'isActive']),
        { new: true, runValidators: true }
    );
    if (!subject) throw new HttpError(404, 'Subject not found');
    res.json({ success: true, message: 'Subject updated successfully', data: subject });
}));

router.delete('/subjects/:id', asyncHandler(async (req, res) => {
    if (await Question.exists({ subject: req.params.id })) {
        throw new HttpError(409, 'Delete or move this subject\'s questions first');
    }
    if (await Exam.exists({ subject: req.params.id })) {
        throw new HttpError(409, 'Delete this subject\'s exams first');
    }
    const subject = await Subject.findByIdAndDelete(req.params.id);
    if (!subject) throw new HttpError(404, 'Subject not found');
    res.json({ success: true, message: 'Subject deleted successfully' });
}));

// Import questions for a subject from CSV or JSON. JSON can be an array or { questions: [...] }.
router.post('/questions/import', asyncHandler(async (req, res) => {
    const { subject, format, content } = req.body || {};
    if (!(await Subject.exists({ _id: subject }))) throw new HttpError(400, 'Select a valid subject');
    if (typeof content !== 'string' || !content.trim()) throw new HttpError(400, 'Upload a non-empty CSV or JSON file');
    let rows;
    try {
        rows = String(format).toLowerCase() === 'json'
            ? (() => { const v = JSON.parse(content); return Array.isArray(v) ? v : v.questions; })()
            : parseCSV(content);
    } catch { throw new HttpError(400, 'Could not parse file. Check CSV/JSON syntax.'); }
    if (!Array.isArray(rows) || !rows.length) throw new HttpError(400, 'No questions found in file');
    if (rows.length > 2000) throw new HttpError(400, 'Import limit is 2000 questions per file');
    const docs = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const options = Array.isArray(r.options) ? r.options : [r.optionA ?? r.a, r.optionB ?? r.b, r.optionC ?? r.c, r.optionD ?? r.d];
        const correctRaw = r.correctOption ?? r.correct_option ?? r.answer;
        const correctOption = typeof correctRaw === 'string' && /^[ABCD]$/i.test(correctRaw.trim()) ? 'ABCD'.indexOf(correctRaw.trim().toUpperCase()) : Number(correctRaw);
        if (!r.question || !Array.isArray(options) || options.length !== 4 || options.some(v => !String(v ?? '').trim()) || !Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3) {
            throw new HttpError(400, `Invalid question at row/item ${i + 2}: require question, four options and correctOption (0-3 or A-D)`);
        }
        docs.push({ question: String(r.question).trim(), options: options.map(String), correctOption, subject,
            marks: Number.isFinite(Number(r.marks)) ? Number(r.marks) : 1,
            difficulty: ['easy','medium','hard'].includes(String(r.difficulty).toLowerCase()) ? String(r.difficulty).toLowerCase() : 'medium',
            createdBy: req.user._id });
    }
    const created = await Question.insertMany(docs, { ordered: true });
    await syncSubjectCount(subject);
    res.status(201).json({ success: true, message: `Imported ${created.length} questions`, count: created.length });
}));

// ============ QUESTIONS ============
const QUESTION_FIELDS = ['question', 'subject', 'options', 'correctOption', 'marks', 'difficulty', 'isActive'];

router.post('/questions', asyncHandler(async (req, res) => {
    if (!(await Subject.exists({ _id: req.body.subject }))) throw new HttpError(400, 'Subject not found');
    const question = await Question.create({ ...pick(req.body, QUESTION_FIELDS), createdBy: req.user._id });
    await syncSubjectCount(question.subject);
    res.status(201).json({ success: true, message: 'Question added successfully', data: question });
}));

router.get('/questions', asyncHandler(async (req, res) => {
    const { subject, isActive, difficulty, search } = req.query;
    const query = {};
    if (subject) query.subject = subject;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (difficulty) query.difficulty = difficulty;
    if (search) query.question = { $regex: String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const questions = await Question.find(query)
        .populate('subject', 'name code')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 });
    res.json({ success: true, count: questions.length, data: questions });
}));

router.put('/questions/:id', asyncHandler(async (req, res) => {
    const question = await Question.findById(req.params.id);
    if (!question) throw new HttpError(404, 'Question not found');
    const oldSubject = question.subject;
    question.set(pick(req.body, QUESTION_FIELDS));
    await question.save();
    await syncSubjectCount(oldSubject);
    await syncSubjectCount(question.subject);
    await question.populate('subject', 'name code');
    res.json({ success: true, message: 'Question updated successfully', data: question });
}));

router.delete('/questions/:id', asyncHandler(async (req, res) => {
    if (await Exam.exists({ questions: req.params.id })) {
        throw new HttpError(409, 'Question is used by an exam. Revoke it instead of deleting.');
    }
    const question = await Question.findByIdAndDelete(req.params.id);
    if (!question) throw new HttpError(404, 'Question not found');
    await syncSubjectCount(question.subject);
    res.json({ success: true, message: 'Question deleted successfully' });
}));

router.patch('/questions/:id/revoke', asyncHandler(async (req, res) => {
    const question = await Question.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!question) throw new HttpError(404, 'Question not found');
    await syncSubjectCount(question.subject);
    res.json({ success: true, message: 'Question revoked successfully', data: question });
}));

// ============ EXAMS ============
const resolveQuestions = async (subjectId, ids) => {
    if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'Select at least one question');
    const unique = [...new Set(ids.map(String))];
    const questions = await Question.find({ _id: { $in: unique }, subject: subjectId, isActive: true });
    if (questions.length !== unique.length) {
        throw new HttpError(400, 'Every question must exist, be active and belong to the exam subject');
    }
    const byId = new Map(questions.map((q) => [String(q._id), q]));
    const ordered = unique.map((id) => byId.get(id));
    return { ids: ordered.map((q) => q._id), totalMarks: ordered.reduce((s, q) => s + q.marks, 0) };
};

router.post('/exams', asyncHandler(async (req, res) => {
    const { title, subject, duration, scheduledDate, questions, negativeMarking, shuffleQuestions } = req.body;
    const resolved = await resolveQuestions(subject, questions);
    const exam = await Exam.create({
        title, subject, duration, scheduledDate,
        questions: resolved.ids,
        totalMarks: resolved.totalMarks,
        createdBy: req.user._id
    });
    res.status(201).json({ success: true, message: 'Exam created successfully', data: exam });
}));

router.get('/exams', asyncHandler(async (req, res) => {
    const exams = await Exam.find()
        .populate('subject', 'name code')
        .populate('createdBy', 'name')
        .sort({ scheduledDate: -1 })
        .lean();
    const data = exams.map((e) => ({ ...e, questionCount: e.questions.length, questions: undefined }));
    res.json({ success: true, count: data.length, data });
}));

router.get('/exams/:id', asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id)
        .populate('questions')
        .populate('subject', 'name code')
        .populate('createdBy', 'name');
    if (!exam) throw new HttpError(404, 'Exam not found');
    res.json({ success: true, data: exam });
}));

router.put('/exams/:id', asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id);
    if (!exam) throw new HttpError(404, 'Exam not found');
    const touchesContent = ['questions', 'duration', 'subject'].some((k) => req.body[k] !== undefined);
    if (touchesContent && (await Attempt.exists({ exam: exam._id }))) {
        throw new HttpError(409, 'Students have already attempted this exam; questions/duration are locked');
    }
    exam.set(pick(req.body, ['title', 'duration', 'scheduledDate', 'subject', 'negativeMarking', 'shuffleQuestions']));
    if (req.body.questions !== undefined) {
        const resolved = await resolveQuestions(exam.subject, req.body.questions);
        exam.questions = resolved.ids;
        exam.totalMarks = resolved.totalMarks;
    }
    await exam.save();
    res.json({ success: true, message: 'Exam updated successfully', data: exam });
}));

router.delete('/exams/:id', asyncHandler(async (req, res) => {
    const exam = await Exam.findByIdAndDelete(req.params.id);
    if (!exam) throw new HttpError(404, 'Exam not found');
    await Attempt.deleteMany({ exam: exam._id });
    res.json({ success: true, message: 'Exam deleted permanently' });
}));

router.patch('/exams/:id/revoke', asyncHandler(async (req, res) => {
    const exam = await Exam.findByIdAndUpdate(req.params.id, { status: 'cancelled' }, { new: true });
    if (!exam) throw new HttpError(404, 'Exam not found');
    res.json({ success: true, message: 'Exam revoked successfully', data: exam });
}));

router.patch('/exams/:id/publish', asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id);
    if (!exam) throw new HttpError(404, 'Exam not found');
    if (exam.questions.length === 0) throw new HttpError(400, 'Exam has no questions');
    if (exam.endsAt() < new Date()) throw new HttpError(400, 'Exam time window is already over; reschedule first');
    exam.status = 'scheduled';
    await exam.save();
    res.json({ success: true, message: 'Exam published successfully', data: exam });
}));

router.get('/exams/:id/results', asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id).select('title totalMarks');
    if (!exam) throw new HttpError(404, 'Exam not found');
    const attempts = await Attempt.find({ exam: exam._id, submittedAt: { $exists: true } })
        .populate('student', 'name email enrollmentNumber')
        .select('student score totalMarks submittedAt')
        .sort({ score: -1 });
    res.json({ success: true, exam, count: attempts.length, data: attempts });
}));

module.exports = router;
