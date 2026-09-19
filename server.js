const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

// Base HTML rendering handler
app.get('/', (req, res) => {
  try {
    const origin = `${req.protocol}://${req.get('host')}`;
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8').replaceAll('__SITE_ORIGIN__', origin);
      return res.type('html').send(html);
    }
    
    res.status(404).send('Index UI file missing inside public directory.');
  } catch (err) {
    console.error('HTML render error:', err);
    res.status(500).send('Internal interface render issue.');
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.get(['/mota-pandori', '/camera'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

// Safe database pool orchestration
let pool = null;
if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 4, 
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ssl: { rejectUnauthorized: false }
    });
    
    // Background execution table check without blocking function main frame
    pool.query(`
      CREATE TABLE IF NOT EXISTS captures (
        id SERIAL PRIMARY KEY,
        image_payload TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).then(() => console.log('Database schema verification ok.'))
      .catch(err => console.error('Database non-blocking schema warning:', err.message));
  } catch (dbErr) {
    console.error('Database connection pool crash wrapper:', dbErr.message);
    pool = null; // Set to null instead of letting the complete app engine die
  }
}

// Post API entry point target pipeline
app.post('/api/capture', async (req, res) => {
  try {
    const { image, sequenceNumber } = req.body;

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ status: 'error', message: 'Payload verification mismatch.' });
    }

    let postgresId = null;

    if (pool) {
      const result = await pool.query(
        'INSERT INTO captures (image_payload) VALUES (\$1) RETURNING id',
        [image]
      );
      postgresId = result.rows[0]?.id || null;
    } else {
      console.log(`[MEMORY MODE ONLY] Frame ${sequenceNumber || 1} processed without remote connection backend data.`);
    }

    res.status(200).json({
      status: 'success',
      message: 'Frame lifecycle operational flow processed successfully.',
      storedInPostgres: Boolean(pool),
      id: postgresId
    });
  } catch (error) {
    console.error('API endpoint data transmission critical failure:', error);
    res.status(500).json({ status: 'error', message: 'Execution logic boundary crash handler.' });
  }
});

// Analytics reporting dashboard handler
app.get('/api/view-captures', async (req, res) => {
  try {
    if (!pool) {
      return res.status(400).send('Database engine environment structure not initialized.');
    }

    const result = await pool.query('SELECT id, created_at, image_payload FROM captures ORDER BY created_at DESC LIMIT 50');
    
    let htmlContent = `
      <html>
      <head>
        <title>Logs Panel Dashboard</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px; text-align: center; }
          .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 20px; margin-top: 30px; }
          .card { background: #1e293b; padding: 12px; border-radius: 12px; border: 1px solid #334155; }
          img { width: 100%; height: auto; border-radius: 8px; }
          p { font-size: 11px; color: #94a3b8; margin-top: 10px; line-height: 1.4; }
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
    console.error('Viewer rendering endpoint runtime failure:', err);
    res.status(500).send('Data mapping collection process failed.');
  }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Local engine debugging stream online: http://localhost:${PORT}`);
    });
}
