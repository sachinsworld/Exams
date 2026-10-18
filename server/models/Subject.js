const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
    name: { type: String, required: [true, 'Subject name is required'], trim: true, unique: true },
    code: { type: String, required: [true, 'Subject code is required'], unique: true, uppercase: true, trim: true },
    description: { type: String, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
    totalQuestions: { type: Number, default: 0 }   // active questions; kept in sync by the admin routes
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);
