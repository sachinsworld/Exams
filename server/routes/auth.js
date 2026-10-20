const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils/http');

const router = express.Router();

const signToken = (id) =>
    jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

const userPayload = (user, token) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    enrollmentNumber: user.enrollmentNumber,
    token
});

// Public self-registration creates STUDENT accounts only.
// Admin accounts are created with:  npm run seed:admin
router.post('/register', asyncHandler(async (req, res) => {
    const { name, email, password, enrollmentNumber } = req.body;
    if (!name || !email || !password) {
        throw new HttpError(400, 'Please provide name, email and password');
    }
    if (await User.findOne({ email: String(email).toLowerCase().trim() })) {
        throw new HttpError(400, 'Email already registered');
    }
    const user = await User.create({ name, email, password, role: 'student', enrollmentNumber, approvalStatus: 'pending' });
    // Do not issue a session until an administrator approves this registration.
    res.status(201).json({
        success: true,
        message: 'Registration submitted for admin review. You can sign in after approval.',
        data: { _id: user._id, name: user.name, email: user.email, role: user.role, approvalStatus: user.approvalStatus }
    });
}));

router.post('/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) throw new HttpError(400, 'Please provide email and password');

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select('+password');
    if (!user || !(await user.comparePassword(String(password)))) {
        throw new HttpError(401, 'Invalid credentials');
    }
    if (!user.isActive) throw new HttpError(403, 'Account has been deactivated by admin');
    if (user.role === 'student' && user.approvalStatus === 'pending') throw new HttpError(403, 'Your sign-up is awaiting administrator approval. Please try again later.');
    if (user.role === 'student' && user.approvalStatus === 'rejected') throw new HttpError(403, 'Your sign-up was not approved. Please contact the administrator.');

    user.lastLogin = new Date();
    await user.save();
    res.json({ success: true, message: 'Login successful', data: userPayload(user, signToken(user._id)) });
}));

// JWTs are stateless: the client discards the token. Endpoint kept for API symmetry.
router.post('/logout', protect, (req, res) => {
    res.json({ success: true, message: 'Logout successful' });
});

router.get('/me', protect, (req, res) => {
    res.json({ success: true, data: req.user });
});

module.exports = router;
