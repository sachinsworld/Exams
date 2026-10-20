// Usage: set MONGODB_URI, ADMIN_EMAIL, ADMIN_PASSWORD (optional ADMIN_NAME) in .env, then:  npm run seed:admin
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const ensureAdmin = require('../utils/ensureAdmin');

(async () => {
    if (!process.env.MONGODB_URI) { console.error('Set MONGODB_URI in .env first.'); process.exit(1); }
    await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'exam_management' });
    const r = await ensureAdmin();
    console.log(r.created ? `✅ Admin created: ${r.email}` : `Nothing changed: ${r.reason}`);
    await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
