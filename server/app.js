const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { notFound, errorHandler } = require('./middleware/error');

for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
    if (!process.env[key]) {
        console.error(`❌ Missing ${key}. Copy .env.example to .env and fill it in.`);
        process.exit(1);
    }
}

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => res.json({ success: true, message: 'Server is running' }));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: 'Too many attempts, try again later' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/student', require('./routes/student'));
app.use('/api', notFound);

// Frontend (static) is served from the same origin => no CORS needed
app.use(express.static(path.join(__dirname, '..', 'client', 'public')));

app.use(errorHandler);

const PORT = process.env.PORT || 5000;
connectDB().then(() => {
    app.listen(PORT, () => console.log(`🚀 Open http://localhost:${PORT}`));
});

module.exports = app;
