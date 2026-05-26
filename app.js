const express = require("express");
const path = require("path");
const session = require("express-session");
require('dotenv').config();
const axios = require('axios');
const BACKEND = process.env.BACKEND_URL || 'http://localhost:3001';
const app = express();

/* ======================================================
================= MIDDLEWARE ============================
====================================================== */

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: "rahasia-super",
    resave: false,
    saveUninitialized: false
  })
);

/* ======================================================
================= VIEW ENGINE ===========================
====================================================== */

app.set("view engine", "ejs");

app.set(
  "views",
  path.join(__dirname, "views")
);

/* ======================================================
================= STATIC FILE ===========================
====================================================== */

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* ======================================================
================= AUTH MIDDLEWARE =======================
====================================================== */

function requireLogin(req, res, next) {

  if (!req.session.user) {
    return res.redirect("/");
  }

  next();

}

/* ======================================================
================= GLOBAL SESSION ========================
====================================================== */

app.use((req, res, next) => {

  res.locals.user =
    req.session.user || null;

  res.locals.role =
    req.session.role || null;

  next();

});

/* ======================================================
================= LOGIN ================================
====================================================== */

app.get("/", (req, res) => {

  res.render("login");

});

app.post('/login', async (req, res) => {
  const { username, password, role } = req.body;

  // Cek apakah username ada di wallet backend
  // (Sederhananya: coba akses endpoint yang butuh auth)
  // Untuk prototype: simpan username di session, kirim ke backend lewat header
  
  req.session.user = username;   // simpan username asli dari wallet
  req.session.role = role;

  if (role === 'Production') return res.redirect('/production');
  if (role === 'Loading')    return res.redirect('/loading');
  if (role === 'Shipping')   return res.redirect('/shipping');
  if (role === 'Terminal')   return res.redirect('/terminal');
  if (role === 'Fueling')    return res.redirect('/fueling');
  if (role === 'Aviation Fuel Business') return res.redirect('/fueling')
  return res.redirect('/dashboard');
  return res.send("Login Gagal");

});

/* ======================================================
================= DASHBOARD =============================
====================================================== */

app.get('/dashboard', requireLogin, async (req, res) => {
  try {
    const batchRes = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });
    const batches = batchRes.data || [];

    const fuelingRes = await axios.get(`${BACKEND}/fueling-list`, {
      headers: { username: req.session.user }
    });
    const fuelings = fuelingRes.data || [];

    const totalProduksi = batches.filter(b => b.production).reduce((s, b) => s + (b.production.Vf || 0), 0);
    const totalShipping = batches.filter(b => b.shipping).reduce((s, b) => s + (b.shipping.Vship_out || 0), 0);
    const totalFueling  = fuelings.reduce((s, f) => s + (f.Vfuel || 0), 0);
    const totalVnTerminal = batches.filter(b => b.terminal).reduce((s, b) => s + (b.terminal.Vn_term_in || 0), 0);
    const totalVnFueling  = fuelings.reduce((s, f) => s + (f.Vn_fuel || 0), 0);
    const currentStock    = totalVnTerminal - totalVnFueling;
    const emissionReduction = (((89 - 13.9) / 89) * 100).toFixed(1);

    const totalNeatSAF = batches.filter(b => b.production).reduce((s, b) => s + (b.production.Vn || 0), 0);
    const totalAvtur   = batches.filter(b => b.production).reduce((s, b) => s + (b.production.Vi || 0), 0);

    // Loss per stage
    const lossLoading  = batches.filter(b => b.loading).reduce((s, b) => s + (b.loading.Lload || 0), 0);
    const lossShipping = batches.filter(b => b.shipping).reduce((s, b) => s + (b.shipping.Lship || 0), 0);
    const lossTerminal = batches.filter(b => b.terminal).reduce((s, b) => s + (b.terminal.Lterm || 0), 0);
    const totalLoss    = lossLoading + lossShipping + lossTerminal;

    // Gain (selisih positif kalau ada)
    const totalGain = 0; // bisa dihitung dari data jika ada

    const validBatch        = batches.filter(b => b.terminal).length;
    const warningBatch      = batches.filter(b => b.production && !b.loading).length;
    const readyTraceability = fuelings.length;
    const totalBatches      = batches.length;

    const newestBatches = [...batches]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 10);

    res.render('dashboard', {
      role: req.session.role,
      user: req.session.user,
      stats: { totalProduksi, totalShipping, totalFueling, currentStock, emissionReduction },
      overview: { totalNeatSAF, totalAvtur, totalLoss, lossLoading, lossShipping, lossTerminal, totalGain },
      dataStatus: {
        validBatch,
        validPct:   totalBatches ? ((validBatch / totalBatches) * 100).toFixed(0) : 0,
        warningBatch,
        warningPct: totalBatches ? ((warningBatch / totalBatches) * 100).toFixed(0) : 0,
        readyTraceability,
        readyPct:   totalBatches ? ((readyTraceability / totalBatches) * 100).toFixed(0) : 0
      },
      newestBatches
    });

  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.render('dashboard', {
      role: req.session.role,
      user: req.session.user,
      stats: { totalProduksi: 0, totalShipping: 0, totalFueling: 0, currentStock: 0, emissionReduction: '84.4' },
      overview: { totalNeatSAF: 0, totalAvtur: 0, totalLoss: 0, lossLoading: 0, lossShipping: 0, lossTerminal: 0, totalGain: 0 },
      dataStatus: { validBatch: 0, validPct: 0, warningBatch: 0, warningPct: 0, readyTraceability: 0, readyPct: 0 },
      newestBatches: []
    });
  }
});

/* ======================================================
============== DASHBOARD DETAIL =========================
====================================================== */

app.get(
  "/dashboard-detail/:id",
  requireLogin,
  (req, res) => {

    const batchId =
      req.params.id;

    res.render("dashboard-detail", {

      batchId: batchId,
      role: req.session.role,
      user: req.session.user

    });

  }
);

/* ======================================================
================= PRODUCTION ============================
====================================================== */

app.get(
  "/production",
  requireLogin,
  (req, res) => {

    res.render("production", {

      status: null,
      role: req.session.role

    });

  }
);

app.post('/production', requireLogin, async (req, res) => {
  const data = req.body;

  try {
    const response = await axios.post(`${BACKEND}/production`, data, {
      headers: {
        'Content-Type': 'application/json',
        'username': req.session.user  // ← WAJIB: ini cara autentikasi backend
      }
    });

    return res.render('production', {
      status: 'valid',
      role: req.session.role
    });

  } catch (err) {
    console.error('Backend error:', err.response?.data || err.message);
    return res.render('production', {
      status: 'invalid',
      role: req.session.role
    });
  }
});
/* ======================================================
================= LOADING ===============================
====================================================== */


app.get('/loading', requireLogin, async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });

    res.render('loading', {
      role:    req.session.role,
      user:    req.session.user,
      batches: response.data   // ← ini yang kurang
    });

  } catch (err) {
    console.error('Loading fetch error:', err.message);

    res.render('loading', {
      role:    req.session.role,
      user:    req.session.user,
      batches: []   // ← tetap kirim array kosong agar EJS tidak error
    });
  }
});
// ✅ BARU
app.get('/loading-detail', requireLogin, async (req, res) => {
  const { batch_id } = req.query;

  try {
    const response = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });

    const batch = response.data.find(b => b.batch_id === batch_id);

    res.render('loading-detail', {
      role:    req.session.role,
      user:    req.session.user,
      status:  null,
      batchId: batch_id,   // ← ini yang kurang
      batch:   batch || null
    });

  } catch (err) {
    console.error('loading-detail GET error:', err.message);

    res.render('loading-detail', {
      role:    req.session.role,
      user:    req.session.user,
      status:  null,
      batchId: batch_id || '',   // ← tetap kirim walau error
      batch:   null
    });
  }
});

app.post('/loading-detail', requireLogin, async (req, res) => {
  const { batch_id, Vload, Vship_in, loading_datetime } = req.body;

  try {
    await axios.post(`${BACKEND}/loading`, {
      batch_id,
      Vload:            parseFloat(Vload),
      Vship_in:         parseFloat(Vship_in),
      loading_datetime
    }, {
      headers: {
        'Content-Type': 'application/json',
        'username': req.session.user,
        'role': req.session.role
      }
    });

    // Ambil data batch untuk ditampilkan kembali setelah sukses
    const batchRes = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });
    const batch = batchRes.data.find(b => b.batch_id === batch_id);

    return res.render('loading-detail', {
      status: 'valid',
      role:   req.session.role,
      batch:  batch || null,
      batchId: batch_id
    });

  } catch (err) {
    console.error('Loading error:', err.response?.status, err.response?.data || err.message);

    let batch = null;
    try {
      const batchRes = await axios.get(`${BACKEND}/batches`, {
        headers: { username: req.session.user }
      });
      batch = batchRes.data.find(b => b.batch_id === batch_id) || null;
    } catch (_) {}

    return res.render('loading-detail', {
      status:  'invalid',
      role:    req.session.role,
      batch:   batch,        // ← sekarang ada datanya
      batchId: batch_id
    });
  }
});

/* ======================================================
================= SHIPPING ==============================
====================================================== */

app.get('/shipping', requireLogin, async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });
    res.render('shipping', { role: req.session.role, batches: response.data });
  } catch (err) {
    res.render('shipping', { role: req.session.role, batches: [] });
  }
});

// Shipping detail — ambil batch spesifik berdasarkan batch_id
app.get('/shipping-detail', requireLogin, async (req, res) => {
  const { batch_id } = req.query;
  try {
    const response = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });
    const batch = response.data.find(b => b.batch_id === batch_id);
    res.render('shipping-detail', {
      role: req.session.role, user: req.session.user,
      status: null, batchId: batch_id, batch: batch || null
    });
  } catch (err) {
    res.render('shipping-detail', {
      role: req.session.role, user: req.session.user,
      status: null, batchId: batch_id, batch: null
    });
  }
});

app.post('/shipping-detail', requireLogin, async (req, res) => {
  const {
    batch_id,
    Vship_out,
    shipment_id,
    transportation_type,
    shipping_datetime
  } = req.body;

  try {
    await axios.post(`${BACKEND}/shipping`, {
      batch_id,
      Vship_out:          parseFloat(Vship_out),
      shipment_id,
      transportation_type,
      shipping_datetime
    }, {
      headers: {
        'Content-Type': 'application/json',
        'username': req.session.user
      }
    });

    // Ambil data batch untuk ditampilkan kembali setelah sukses
    const batchRes = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });
    const batch = batchRes.data.find(b => b.batch_id === batch_id);

    return res.render('shipping-detail', {
      status: 'valid',
      role:   req.session.role,
      batch:  batch || null,
      batchId: batch_id
    });

  } catch (err) {
    console.error('Shipping error:', err.response?.data || err.message);

    return res.render('shipping-detail', {
      status: 'invalid',
      role:   req.session.role,
      batch:  null,
      batchId: batch_id
    });
  }
});

/* ======================================================
================= TERMINAL ==============================
====================================================== */

app.get('/terminal', requireLogin, async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });
    res.render('terminal', { role: req.session.role, batches: response.data });
  } catch (err) {
    res.render('terminal', { role: req.session.role, batches: [] });
  }
});

// Terminal detail — ambil batch spesifik
app.get('/terminal-detail', requireLogin, async (req, res) => {
  const { batch_id } = req.query;
  res.render('terminal-detail', {
    role: req.session.role, status: null, batchId: batch_id
  });
});

app.post('/terminal-detail', requireLogin, async (req, res) => {
  const {
    batch_id,
    terminal_location,
    tank_id,
    Vtank_now,
    terminal_datetime
  } = req.body;

  try {
    await axios.post(`${BACKEND}/terminal`, {
      batch_id,
      terminal_location,
      tank_id,
      Vtank_now:        parseFloat(Vtank_now),
      terminal_datetime
    }, {
      headers: {
        'Content-Type': 'application/json',
        'username': req.session.user
      }
    });

    return res.render('terminal-detail', {
      status: 'valid',
      role:   req.session.role,
      batchId: batch_id
    });

  } catch (err) {
    console.error('Terminal error:', err.response?.data || err.message);

    return res.render('terminal-detail', {
      status: 'invalid',
      role:   req.session.role,
      batchId: batch_id
    });
  }
});

/* ======================================================
========== AVIATION FUEL BUSINESS =======================
====================================================== */

app.get('/fueling', requireLogin, async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND}/batches`, {
      headers: { username: req.session.user }
    });
    res.render('fueling', {
      role: req.session.role,
      user: req.session.user,
      batches: response.data
    });
  } catch (err) {
    console.error('Fueling fetch error:', err.message);
    res.render('fueling', {
      role: req.session.role,
      user: req.session.user,
      batches: []
    });
  }
});

app.get(
  "/fueling-detail",
  requireLogin,
  (req, res) => {

    res.render("fueling-detail", {

      status: null,
      role: req.session.role

    });

  }
);

app.post('/fueling-detail', requireLogin, async (req, res) => {
  const {
    tank_id,
    volume,
    n,
    fueling_datetime,
    recipient_name,
    recipient_address,
    recipient_contract_number
  } = req.body;

  try {
    await axios.post(`${BACKEND}/fueling`, {
      tank_id,
      volume:           parseFloat(volume),
      n:                parseFloat(n),
      fueling_datetime,
      recipient: {
        name:            recipient_name,
        address:         recipient_address,
        contract_number: recipient_contract_number
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'username': req.session.user
      }
    });

    return res.render('fueling-detail', {
      status: 'valid',
      role:   req.session.role
    });

  } catch (err) {
    console.error('Fueling error:', err.response?.data || err.message);

    return res.render('fueling-detail', {
      status: 'invalid',
      role:   req.session.role
    });
  }
});

/* ======================================================
================= TRACEABILITY ==========================
====================================================== */
app.get('/traceability', requireLogin, async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND}/fueling-list`, {
      headers: { username: req.session.user }
    });
    res.render('traceability', {
      role: req.session.role,
      user: req.session.user,
      fuelings: response.data
    });
  } catch (err) {
    res.render('traceability', { role: req.session.role, user: req.session.user, fuelings: [] });
  }
});

// Traceability detail — ambil trace berdasarkan TX ID dari backend
app.get('/traceability-detail/:txId', requireLogin, async (req, res) => {
  try {
    const response = await axios.get(`${BACKEND}/trace/blockchain/${req.params.txId}`, {
      headers: { username: req.session.user }
    });
    res.render('traceability-detail', {
      role: req.session.role,
      user: req.session.user,
      traceData: response.data   // { fueling: {...}, trace: [...] }
    });
  } catch (err) {
    res.redirect('/traceability');
  }
});
/*=====================================================
================= POS PREVIEW ===========================
====================================================== */

app.get(
  "/pos-preview",
  requireLogin,
  (req, res) => {

    res.render("pos-preview", {

      role: req.session.role,
      user: req.session.user

    });

  }
);

/* ======================================================
================= PROFILE ===============================
====================================================== */

app.get(
  "/profile",
  requireLogin,
  (req, res) => {

    res.render("profile", {

      role: req.session.role,
      user: req.session.user

    });

  }
);

/* ======================================================
================= LOGOUT ================================
====================================================== */

app.get(
  "/logout",
  (req, res) => {

    req.session.destroy(() => {

      res.redirect("/");

    });

  }
);

/* ======================================================
================= SERVER ================================
====================================================== */

app.listen(3000, () => {

  console.log(
    "Server jalan di http://localhost:3000"
  );

});
