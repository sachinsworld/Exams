const mongoose = require('mongoose');

const examSchema = new mongoose.Schema({
    title: { type: String, required: [true, 'Exam title is required'], trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    duration: { type: Number, required: [true, 'Duration in minutes is required'], min: 1 },
    totalMarks: { type: Number, required: true },          // computed from questions
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    scheduledDate: { type: Date, required: [true, 'Scheduled date is required'] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['draft', 'scheduled', 'cancelled'], default: 'draft' }
}, { timestamps: true });

// An exam is "live" when scheduled and now is within [scheduledDate, scheduledDate + duration]
examSchema.methods.endsAt = function () {
    return new Date(this.scheduledDate.getTime() + this.duration * 60000);
};

module.exports = mongoose.model('Exam', examSchema);
