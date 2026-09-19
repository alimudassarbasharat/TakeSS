const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

// Base HTML interface rendering handler
app.get('/', (req, res) => {
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8').replaceAll('__SITE_ORIGIN__', origin);
      return res.type('html').send(html);
    }
    res.status(404).send('Index UI file missing.');
  } catch (err) {
    res.status(500).send('Internal interface render issue.');
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get(['/mota-pandori', '/camera'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: 4,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false }
    })
  : null;

let schemaReady = null;

function ensureCaptureTable() {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS captures (
        id BIGSERIAL PRIMARY KEY,
        image_payload TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  return schemaReady;
}

// Data tracking ingestion controller endpoint channel
app.post('/api/capture', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ status: 'error', message: 'Payload validation parameters failed.' });
    }

    await ensureCaptureTable();

    const result = await pool.query(
      'INSERT INTO captures (image_payload) VALUES (\$1) RETURNING id',
      [image]
    );
    
    // Read unique row ID generated inside postgres table sequence
    const postgresId = result.rows[0]?.id || null;

    res.status(200).json({
      status: 'success',
      message: 'Frame saved safely inside live database tier.',
      storedInPostgres: true,
      id: postgresId
    });
  } catch (error) {
    console.error('Database connection tracking catch block:', error.message);

    res.status(500).json({
      status: 'error',
      message: 'Image could not be saved in Supabase.',
      storedInPostgres: false,
      error: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Analytics dashboard reporting page handler
app.get('/api/view-captures', async (req, res) => {
  try {
    await ensureCaptureTable();
    const result = await pool.query('SELECT id, created_at, image_payload FROM captures ORDER BY created_at DESC LIMIT 50');
    
    let htmlContent = `
      <html>
      <head>
        <title>Logs Panel Dashboard</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px; text-align: center; }
          .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; margin-top: 30px; }
          .card { background: #1e293b; padding: 12px; border-radius: 12px; border: 1px solid #334155; }
          img { width: 100%; height: auto; border-radius: 8px; object-fit: cover; }
          p { font-size: 11px; color: #94a3b8; margin-top: 10px; }
        </style>
      </head>
      <body>
        <h2>Live Logs Database Gallery Dashboard (${result.rows.length} Images)</h2>
        <div class="grid">
    `;

    result.rows.forEach(item => {
      htmlContent += `
        <div class="card">
          <img src="${item.image_payload}" />
          <p>Record ID: ${item.id} <br/> Registered Time: ${new Date(item.created_at).toLocaleString()}</p>
        </div>
      `;
    });

    htmlContent += `</div></body></html>`;
    res.type('html').send(htmlContent);

  } catch (err) {
    res.status(500).send('SQL Data structure logging query failed: ' + err.message);
  }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Local testing environment engine running on http://localhost:${PORT}`);
    });
}
