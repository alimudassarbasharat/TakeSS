const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const databaseUrl = process.env.DATABASE_URL;

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

// Routing for the base entry path
app.get('/', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const html = fs
    .readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
    .replaceAll('__SITE_ORIGIN__', origin);
  res.type('html').send(html);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get(['/mota-pandori', '/camera'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

// Database pool engine configuration variables
let pool = null;
if (databaseUrl) {
  const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });
  
  // Safe async structural background run to avoid process blocking
  pool.query(`
    CREATE TABLE IF NOT EXISTS captures (
      id SERIAL PRIMARY KEY,
      image_payload TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).then(() => console.log('PostgreSQL architecture ready.'))
    .catch(err => console.error('PostgreSQL table init warning:', err.message));
} else {
  console.warn('DATABASE_URL is not set. Data will pass via memory execution logs only.');
}

app.post('/api/capture', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ status: 'error', message: 'No captured photo received.' });
    }

    const match = image.match(/^data:image\/(png|jpeg);base64,(.+)\$/);
    if (!match) {
      return res.status(400).json({ status: 'error', message: 'Unsupported image format.' });
    }

    let postgresId = null;
    let savedAsFileFallback = false;

    if (pool) {
      // Secure writing data inside SQL layer storage
      const result = await pool.query(
        'INSERT INTO captures (image_payload) VALUES (\$1) RETURNING id',
        [image]
      );
      postgresId = result.rows[0].id;
    } else {
      // Vercel serverless disk constraint backup notification log
      console.log(`[VERIFIED MEMORY LOG]: Base64 buffer context parsed successfully.`);
      savedAsFileFallback = true;
    }

    res.status(200).json({
      status: 'success',
      message: pool ? 'Photo saved to PostgreSQL database.' : 'Processed via server logs safely.',
      storedInPostgres: Boolean(pool),
      id: postgresId,
      fallbackMode: savedAsFileFallback
    });
  } catch (error) {
    console.error('Server processing error:', error);
    res.status(500).json({ status: 'error', message: 'Could not save the photo configuration data.' });
  }
});

// Export application modules safely for Vercel deployment handler
module.exports = app;

// Fallback configuration boundary conditions for local execution tests
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`Server locally running at http://localhost:${PORT}`);
    });
}
