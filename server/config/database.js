const mongoose = require('mongoose');

// The database name is fixed (MONGODB_DB, default "exam_management") so the app,
// the seed script and the Streamlit dashboard always read the same database,
// even if the connection string has no database name.
const connectDB = async () => {
    const dbName = process.env.MONGODB_DB || 'exam_management';
    try {
        await mongoose.connect(process.env.MONGODB_URI, { dbName, serverSelectionTimeoutMS: 15000 });
        console.log(`✅ MongoDB connected (database: ${dbName})`);
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.error('   Check MONGODB_URI, the Atlas user/password, and Atlas Network Access (IP allow-list).');
        process.exit(1);
    }
};

module.exports = connectDB;
