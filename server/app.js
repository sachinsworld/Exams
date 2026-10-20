const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const { notFound, errorHandler } = require('./middleware/error');
const ensureAdmin = require('./utils/ensureAdmin');

for (const key of ['MONGODB_URI', 'JWT_SECRET']) {
    if (!process.env[key]) {
        console.error(`❌ Missing ${key}. Copy .env.example to .env and fill it in.`);
        process.exit(1);
    }
}

const app = express();

// Granth Portal runs as an isolated, same-origin sub-application. Its existing
// auth, database, admin and student workflows remain intact at /granth.
const GRANTh_PORT = Number(process.env.GRANTH_INTERNAL_PORT || 3107);
let granthProcess = null;
function startGranthPortal() {
    if (process.env.GRANTH_DISABLED === '1') return;
    const script = path.join(__dirname, 'granth-portal', 'server.js');
    const env = {
        ...process.env,
        MONGODB_URI: process.env.GRANTH_MONGODB_URI || '',
        MONGODB_DB: process.env.GRANTH_MONGODB_DB || 'granth',
        PORT: String(GRANTh_PORT),
        DATA_DIR: process.env.GRANTH_DATA_DIR || path.join(__dirname, '..', 'data', 'granth')
    };
    granthProcess = spawn(process.execPath, [script], { env, stdio: 'inherit' });
    granthProcess.on('error', err => console.error('Granth Portal failed to start:', err.message));
    granthProcess.on('exit', (code, signal) => {
        if (code && code !== 0) console.error(`Granth Portal exited (${code || signal})`);
    });
}
function proxyGranth(req, res) {
    // Express mount removes /granth from req.url. Force identity encoding so
    // the HTML can be safely rewritten to route Granth API calls through prefix.
    const headers = { ...req.headers, host: req.headers.host, 'accept-encoding': 'identity', 'x-forwarded-proto': req.headers['x-forwarded-proto'] || req.protocol };
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
        body = Buffer.from(JSON.stringify(req.body));
        headers['content-type'] = 'application/json';
        headers['content-length'] = String(body.length);
    }
    const upstream = http.request({
        hostname: '127.0.0.1', port: GRANTh_PORT,
        path: req.url || '/', method: req.method, headers
    }, upstreamRes => {
        const chunks = [];
        upstreamRes.on('data', chunk => chunks.push(chunk));
        upstreamRes.on('end', () => {
            let payload = Buffer.concat(chunks);
            const h = { ...upstreamRes.headers };
            if ((h['content-type'] || '').includes('text/html')) {
                payload = Buffer.from(payload.toString('utf8').replace(/\/api\//g, '/granth/api/'));
                h['content-length'] = String(payload.length);
            }
            delete h['transfer-encoding'];
            res.writeHead(upstreamRes.statusCode || 502, h);
            res.end(payload);
        });
    });
    upstream.on('error', err => {
        if (!res.headersSent) res.status(503).json({ error: 'Granth Portal is starting or unavailable', detail: err.message });
        else res.end();
    });
    if (body) upstream.write(body);
    else if (req.method !== 'GET' && req.method !== 'HEAD' && !req.body) req.pipe(upstream);
    upstream.end();
}
app.use('/granth', express.json({ limit: '60mb' }), proxyGranth);

app.set('trust proxy', 1);   // Render sits behind a proxy (needed for rate limiting / client IPs)

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '60mb' }));

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
connectDB().then(async () => {
    try {
        const r = await ensureAdmin();
        console.log(r.created ? `✅ First admin created: ${r.email}` : `ℹ️  Admin bootstrap skipped: ${r.reason}`);
    } catch (e) {
        console.error('Admin bootstrap failed:', e.message);
    }
    app.listen(PORT, () => {
        console.log(`🚀 Listening on port ${PORT}`);
        startGranthPortal();
    });
});

process.on('SIGTERM', () => { if (granthProcess) granthProcess.kill('SIGTERM'); });
process.on('SIGINT', () => { if (granthProcess) granthProcess.kill('SIGINT'); });

module.exports = app;
