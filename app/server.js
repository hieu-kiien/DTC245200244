const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const client = require('prom-client');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json());
// Bắt lỗi bất đồng bộ của các route để không treo request (chuyển sang middleware lỗi)
const wrap = fn => (req, res, next) => { try { Promise.resolve(fn(req, res, next)).catch(next); } catch (e) { next(e); } };
['get', 'post', 'put', 'delete'].forEach(m => { const o = app[m].bind(app); app[m] = (p, ...h) => h.length ? o(p, ...h.map(wrap)) : o(p); });

// ---------- Log có cấu trúc (stdout -> Promtail -> Loki) ----------
function log(level, event, extra = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, event, ...extra }));
}
// Dòng log dạng text dễ truy vấn bằng LogQL: level=ERROR event=LOGIN_FAILED ip=...
function logText(level, event, extra = {}) {
  const kv = Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`${new Date().toISOString()} level=${level} event=${event} ${kv}`);
}

// ---------- Metrics ----------
client.collectDefaultMetrics();
const loginFailed = new client.Counter({ name: 'petshop_login_failed_total', help: 'Số lần đăng nhập thất bại' });
const httpDur = new client.Histogram({
  name: 'petshop_http_request_duration_seconds', help: 'Thời gian xử lý request',
  labelNames: ['method', 'route', 'status'], buckets: [0.01, 0.05, 0.1, 0.3, 1, 3]
});
app.use((req, res, next) => {
  const end = httpDur.startTimer();
  res.on('finish', () => end({ method: req.method, route: req.route ? req.route.path : req.path, status: res.statusCode }));
  next();
});

// ---------- Database ----------
const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
const q = (text, params) => pool.query(text, params);

// ---------- Xác thực đơn giản (token trong bộ nhớ) ----------
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD;
const tokens = new Map();
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // token demo hết hạn sau 8 giờ
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const ip = req.ip;
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    const t = crypto.randomBytes(24).toString('hex');
    tokens.set(t, Date.now() + TOKEN_TTL_MS);
    logText('INFO', 'LOGIN_SUCCESS', { user: username, ip });
    return res.json({ token: t });
  }
  loginFailed.inc();
  logText('WARN', 'LOGIN_FAILED', { user: username, ip });
  res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
});
function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const expiry = tokens.get(t);
  if (!expiry || expiry <= Date.now()) {
    tokens.delete(t);
    return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
  }
  next();
}

app.post('/api/logout', auth, (req, res) => {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  tokens.delete(t);
  res.status(204).end();
});

// Kiểm tra quan hệ giữa khách hàng và thú cưng trước khi lưu lịch hẹn.
async function validateAppointment(body) {
  if (!body || !body.customer_id || !body.pet_id || !body.service_id || !body.appt_time)
    return 'Lịch hẹn phải có khách hàng, thú cưng, dịch vụ và thời gian';
  if (Number.isNaN(Date.parse(body.appt_time))) return 'Thời gian lịch hẹn không hợp lệ';
  const result = await q('SELECT customer_id FROM pets WHERE id=$1', [body.pet_id]);
  if (!result.rows.length) return 'Thú cưng không tồn tại';
  const owner = result.rows[0].customer_id;
  if (owner != null && String(owner) !== String(body.customer_id))
    return 'Thú cưng đã có chủ khác với khách hàng được chọn';
  return null;
}

// ---------- CRUD ----------
function crud(name, table, cols) {
  app.get(`/api/${name}`, auth, async (req, res) => {
    const r = await q(`SELECT * FROM ${table} ORDER BY id DESC`);
    res.json(r.rows);
  });
  app.post(`/api/${name}`, auth, async (req, res) => {
    if (table === 'appointments') {
      const error = await validateAppointment(req.body);
      if (error) return res.status(400).json({ error });
    }
    const vals = cols.map(c => (req.body[c] === '' ? null : req.body[c]));
    const r = await q(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, vals);
    log('INFO', 'CREATE', { table, id: r.rows[0].id });
    res.status(201).json(r.rows[0]);
  });
  app.put(`/api/${name}/:id`, auth, async (req, res) => {
    if (table === 'appointments') {
      const error = await validateAppointment(req.body);
      if (error) return res.status(400).json({ error });
    }
    const vals = cols.map(c => (req.body[c] === '' ? null : req.body[c]));
    const r = await q(`UPDATE ${table} SET ${cols.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE id=$${cols.length + 1} RETURNING *`, [...vals, req.params.id]);
    res.json(r.rows[0] || {});
  });
  app.delete(`/api/${name}/:id`, auth, async (req, res) => {
    await q(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]);
    log('INFO', 'DELETE', { table, id: req.params.id });
    res.status(204).end();
  });
}
crud('customers', 'customers', ['full_name', 'phone', 'email', 'address']);
crud('pets', 'pets', ['name', 'species', 'breed', 'age', 'price', 'status', 'customer_id']);
crud('services', 'services', ['name', 'description', 'price', 'duration_min']);
crud('appointments', 'appointments', ['customer_id', 'pet_id', 'service_id', 'appt_time', 'status', 'note']);

app.get('/api/appointments-view', auth, async (req, res) => {
  const r = await q(`SELECT a.id, a.appt_time, a.status, a.note, c.full_name AS customer, p.name AS pet, s.name AS service
    FROM appointments a
    LEFT JOIN customers c ON c.id=a.customer_id
    LEFT JOIN pets p ON p.id=a.pet_id
    LEFT JOIN services s ON s.id=a.service_id
    ORDER BY a.appt_time DESC`);
  res.json(r.rows);
});
app.get('/api/stats', auth, async (req, res) => {
  const r = await q(`SELECT
    (SELECT count(*) FROM customers) AS customers,
    (SELECT count(*) FROM pets) AS pets,
    (SELECT count(*) FROM services) AS services,
    (SELECT count(*) FROM appointments WHERE status='Chờ'  ) AS pending`);
  res.json(r.rows[0]);
});

// ---------- Webhook nhận cảnh báo từ Grafana Alerting ----------
// Chỉ truy cập được từ mạng nội bộ Docker (Nginx không proxy đường dẫn này)
app.post('/internal/alert', (req, res) => {
  const alerts = (req.body && req.body.alerts) || [];
  for (const a of alerts) {
    logText('CRITICAL', 'ALERT_RECEIVED', {
      status: a.status, alertname: (a.labels || {}).alertname, summary: ((a.annotations || {}).summary || '').replace(/\s+/g, '_')
    });
  }
  res.json({ ok: true });
});

// ---------- Hệ thống ----------
app.get('/health', async (req, res) => {
  try { await q('SELECT 1'); res.json({ status: 'ok' }); }
  catch (e) { logText('ERROR', 'DB_UNAVAILABLE', { msg: e.message }); res.status(500).json({ status: 'db_error' }); }
});
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});
app.use(express.static(__dirname + '/public'));

app.use((err, req, res, next) => {
  if (err.code === '23503') { logText('WARN', 'FK_VIOLATION', { path: req.path }); return res.status(400).json({ error: 'Dữ liệu liên kết không hợp lệ' }); }
  if (err.code === '23514') { logText('WARN', 'CHECK_VIOLATION', { path: req.path }); return res.status(400).json({ error: 'Giá trị hoặc trạng thái không hợp lệ' }); }
  if (err.code === '22P02' || err.code === '22007') { return res.status(400).json({ error: 'Định dạng dữ liệu không hợp lệ' }); }
  if (err.code === '23502') { logText('WARN', 'MISSING_FIELD', { path: req.path }); return res.status(400).json({ error: 'Thiếu dữ liệu bắt buộc' }); }
  logText('ERROR', 'UNHANDLED', { msg: String(err.message).replace(/\s+/g, '_'), path: req.path });
  res.status(500).json({ error: 'Lỗi hệ thống' });
});

app.listen(3000, () => logText('INFO', 'SERVER_STARTED', { port: 3000 }));
