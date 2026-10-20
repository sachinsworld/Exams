const express = require('express');
const User = require('../models/User');
const Subject = require('../models/Subject');
const Question = require('../models/Question');
const Exam = require('../models/Exam');
const Attempt = require('../models/Attempt');
const { protect, authorize } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils/http');

const router = express.Router();
router.use(protect, authorize('student'));

const GRACE_MS = 60 * 1000;   // network/clock slack when submitting

const publicQuestions = (questions) =>
    questions.map((q) => ({ _id: q._id, question: q.question, options: q.options, marks: q.marks }));

const examState = (exam, now = new Date()) => {
    if (now < exam.scheduledDate) return 'upcoming';
    if (now <= exam.endsAt()) return 'live';
    return 'ended';
};

router.get('/dashboard', asyncHandler(async (req, res) => {
    const now = new Date();
    const [exams, attempts] = await Promise.all([
        Exam.find({ status: 'scheduled' }).populate('subject', 'name code'),
        Attempt.find({ student: req.user._id }).select('exam submittedAt')
    ]);
    const open = exams.filter((e) => e.endsAt() >= now);
    res.json({
        success: true,
        data: {
            profile: req.user,
            upcomingExams: open.length,
            completedExams: attempts.filter((a) => a.submittedAt).length
        }
    });
}));

router.get('/exams/available', asyncHandler(async (req, res) => {
    const now = new Date();
    const [exams, attempts] = await Promise.all([
        Exam.find({ status: 'scheduled' }).populate('subject', 'name code').sort({ scheduledDate: 1 }),
        Attempt.find({ student: req.user._id }).select('exam submittedAt')
    ]);
    const byExam = new Map(attempts.map((a) => [String(a.exam), a]));
    const data = exams
        .filter((e) => e.endsAt() >= now)
        .map((e) => {
            const a = byExam.get(String(e._id));
            return {
                _id: e._id, title: e.title, subject: e.subject, duration: e.duration,
                totalMarks: e.totalMarks, scheduledDate: e.scheduledDate,
                state: examState(e, now),
                attempt: a ? (a.submittedAt ? 'submitted' : 'in_progress') : 'none'
            };
        });
    res.json({ success: true, count: data.length, data });
}));


// Practice mode: students choose one or more subjects and can select all available questions.
router.get('/practice/subjects', asyncHandler(async (req, res) => {
    const subjects = await Subject.find().select('name code totalQuestions').sort({ name: 1 });
    res.json({ success: true, data: subjects });
}));

router.post('/practice/questions', asyncHandler(async (req, res) => {
    const subjectIds = Array.isArray(req.body.subjects) ? req.body.subjects.filter(Boolean) : [];
    if (!subjectIds.length) throw new HttpError(400, 'Choose at least one subject');
    const limit = Math.max(1, Math.min(500, Number(req.body.limit) || 50));
    let questions = await Question.find({ subject: { $in: subjectIds }, isActive: true }).populate('subject', 'name code').lean();
    if (!questions.length) throw new HttpError(404, 'No active questions found for the selected subjects');
    if (req.body.shuffle === true) questions = questions.sort(() => Math.random() - 0.5);
    if (req.body.selectAll !== true) questions = questions.slice(0, limit);
    res.json({ success: true, count: questions.length, data: questions.map(q => ({
        _id: q._id, question: q.question, options: q.options, correctOption: q.correctOption, marks: q.marks, subject: q.subject
    })) });
}));

// Start (or resume) an attempt. Questions are returned WITHOUT correct answers.
router.post('/exams/:id/start', asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id).populate('questions');
    if (!exam || exam.status !== 'scheduled') throw new HttpError(404, 'Exam not available');
    const now = new Date();
    if (examState(exam, now) !== 'live') throw new HttpError(403, 'Exam is not open right now');

    let attempt = await Attempt.findOne({ exam: exam._id, student: req.user._id });
    if (attempt && attempt.submittedAt) throw new HttpError(409, 'You have already submitted this exam');
    if (!attempt) {
        try {
            const requestedDuration = Number(req.body.duration);
            const duration = Number.isFinite(requestedDuration) ? Math.max(1, Math.min(180, Math.floor(requestedDuration))) : exam.duration;
            const requestedPenalty = Number(req.body.negativeMarking);
            const negativeMarking = Number.isFinite(requestedPenalty) ? Math.max(0, Math.min(1, requestedPenalty)) : (exam.negativeMarking || 0);
            const shuffleQuestions = typeof req.body.shuffleQuestions === 'boolean' ? req.body.shuffleQuestions : !!exam.shuffleQuestions;
            attempt = await Attempt.create({ exam: exam._id, student: req.user._id, totalMarks: exam.totalMarks, duration, negativeMarking, shuffleQuestions });
        } catch (e) {
            if (e.code !== 11000) throw e;
            attempt = await Attempt.findOne({ exam: exam._id, student: req.user._id });
        }
    }
    const duration = attempt.duration || exam.duration;
    const deadline = new Date(attempt.startedAt.getTime() + duration * 60000);
    let questions = publicQuestions(exam.questions);
    if (attempt.shuffleQuestions) questions = questions.sort(() => Math.random() - 0.5);
    res.json({
        success: true,
        data: {
            examId: exam._id, title: exam.title, duration, totalMarks: exam.totalMarks, negativeMarking: attempt.negativeMarking, shuffleQuestions: attempt.shuffleQuestions,
            startedAt: attempt.startedAt, deadline, serverTime: now,
            questions
        }
    });
}));

// Body: { answers: { "<questionId>": <0-3>, ... } }  Scored on the server.
router.post('/exams/:id/submit', asyncHandler(async (req, res) => {
    const exam = await Exam.findById(req.params.id).populate('questions');
    if (!exam) throw new HttpError(404, 'Exam not found');
    const attempt = await Attempt.findOne({ exam: exam._id, student: req.user._id });
    if (!attempt) throw new HttpError(400, 'You have not started this exam');
    if (attempt.submittedAt) throw new HttpError(409, 'You have already submitted this exam');

    const now = new Date();
    const deadline = attempt.startedAt.getTime() + (attempt.duration || exam.duration) * 60000 + GRACE_MS;
    if (now.getTime() > deadline) throw new HttpError(403, 'Time is over; submission rejected');

    const given = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    let score = 0;
    const answers = [];
    const results = [];
    for (const q of exam.questions) {
        const raw = given[String(q._id)];
        const selected = Number.isInteger(raw) && raw >= 0 && raw <= 3 ? raw : undefined;
        const isCorrect = selected === q.correctOption;
        if (isCorrect) score += q.marks;
        else if (selected !== undefined && attempt.negativeMarking > 0) score -= q.marks * attempt.negativeMarking;
        answers.push({ question: q._id, selected, isCorrect });
        results.push({
            questionId: q._id, question: q.question, options: q.options,
            selected, correctOption: q.correctOption, isCorrect
        });
    }
    attempt.set({ answers, score: Math.max(0, Number(score.toFixed(4))), totalMarks: exam.totalMarks, submittedAt: now });
    await attempt.save();

    res.json({
        success: true,
        message: 'Exam submitted successfully',
        data: {
            score, totalMarks: exam.totalMarks,
            percentage: exam.totalMarks ? Number(((score / exam.totalMarks) * 100).toFixed(2)) : 0,
            results
        }
    });
}));

router.get('/results', asyncHandler(async (req, res) => {
    const attempts = await Attempt.find({ student: req.user._id, submittedAt: { $exists: true } })
        .populate({ path: 'exam', select: 'title subject', populate: { path: 'subject', select: 'name code' } })
        .select('exam score totalMarks submittedAt')
        .sort({ submittedAt: -1 });
    res.json({ success: true, count: attempts.length, data: attempts });
}));

router.get('/profile', (req, res) => res.json({ success: true, data: req.user }));

router.put('/profile', asyncHandler(async (req, res) => {
    const user = await User.findByIdAndUpdate(
        req.user._id, { name: req.body.name }, { new: true, runValidators: true }
    ).select('-password');
    res.json({ success: true, message: 'Profile updated successfully', data: user });
}));

module.exports = router;
