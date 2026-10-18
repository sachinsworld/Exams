// Usage: set ADMIN_EMAIL / ADMIN_PASSWORD (and optionally ADMIN_NAME) in .env, then
//        npm run seed:admin
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
    const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
    if (!MONGODB_URI || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
        console.error('Set MONGODB_URI, ADMIN_EMAIL and ADMIN_PASSWORD in .env first.');
        process.exit(1);
    }
    await mongoose.connect(MONGODB_URI);
    const email = ADMIN_EMAIL.toLowerCase().trim();
    const existing = await User.findOne({ email });
    if (existing) {
        console.log(`User ${email} already exists (role: ${existing.role}). Nothing changed.`);
    } else {
        await User.create({ name: ADMIN_NAME || 'Administrator', email, password: ADMIN_PASSWORD, role: 'admin' });
        console.log(`✅ Admin created: ${email}`);
    }
    await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
