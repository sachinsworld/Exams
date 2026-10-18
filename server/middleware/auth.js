const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler, HttpError } = require('../utils/http');

exports.protect = asyncHandler(async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.split(' ')[1] : null;
    if (!token) throw new HttpError(401, 'Not authorized to access this route');

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
        throw new HttpError(401, 'Not authorized to access this route');
    }
    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
        throw new HttpError(401, 'Account is deactivated or no longer exists');
    }
    req.user = user;
    next();
});

exports.authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: `Role '${req.user.role}' is not authorized to access this route`
        });
    }
    next();
};
