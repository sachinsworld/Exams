const mongoose = require('mongoose');

const attemptSchema = new mongoose.Schema({
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    duration: { type: Number, min: 1 },
    negativeMarking: { type: Number, min: 0, max: 1, default: 0 },
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    submittedAt: Date,
    answers: [{
        question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        selected: { type: Number, min: 0, max: 3 },
        isCorrect: Boolean
    }],
    score: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 }
}, { timestamps: true });

attemptSchema.index({ exam: 1, student: 1 }, { unique: true });   // one attempt per student per exam

module.exports = mongoose.model('Attempt', attemptSchema);
