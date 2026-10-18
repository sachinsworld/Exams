const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    question: { type: String, required: [true, 'Question text is required'], trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    options: {
        type: [{ type: String, trim: true, required: true }],
        validate: [(v) => v.length === 4, 'Exactly 4 options are required']
    },
    correctOption: { type: Number, required: true, min: 0, max: 3 },
    marks: { type: Number, default: 1, min: 0 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Question', questionSchema);
