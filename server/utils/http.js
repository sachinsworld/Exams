class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}

const asyncHandler = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// Copy only allowed keys from an object (prevents mass-assignment)
const pick = (obj, keys) =>
    keys.reduce((acc, k) => {
        if (obj && obj[k] !== undefined) acc[k] = obj[k];
        return acc;
    }, {});

module.exports = { HttpError, asyncHandler, pick };
