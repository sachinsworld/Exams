const User = require('../models/User');

// Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD, but ONLY if no admin exists yet.
// Never overwrites or promotes an existing account.
module.exports = async function ensureAdmin() {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return { created: false, reason: 'ADMIN_EMAIL/ADMIN_PASSWORD not set' };
    if (await User.exists({ role: 'admin' })) return { created: false, reason: 'an admin already exists' };
    const email = ADMIN_EMAIL.toLowerCase().trim();
    if (await User.exists({ email })) {
        return { created: false, reason: `${email} is already registered as a student; promote it in Atlas/Compass` };
    }
    await User.create({ name: ADMIN_NAME || 'Administrator', email, password: ADMIN_PASSWORD, role: 'admin' });
    return { created: true, email };
};
