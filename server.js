const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'uploads');
const databaseUrl = process.env.DATABASE_URL;

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));

app.get('/', (req, res) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  const html = fs
    .readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
    .replaceAll('__SITE_ORIGIN__', origin);
  res.type('html').send(html);
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

app.get(['/mota-pandori', '/camera'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'camera.html'));
});

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

let pool = null;

if (databaseUrl) {
  const isLocal = databaseUrl.includes('localhost') || databaseUrl.includes('127.0.0.1');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });
}

async function initDatabase() {
  if (!pool) {
    console.warn('DATABASE_URL is not set. Submitted photos will be saved as files only.');
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS captures (
      id SERIAL PRIMARY KEY,
      image_payload TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('Connected to PostgreSQL.');
}

app.post('/api/capture', async (req, res) => {
  try {
    const { image } = req.body;

    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      return res.status(400).json({ status: 'error', message: 'No captured photo received.' });
    }

    const match = image.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ status: 'error', message: 'Unsupported image format.' });
    }

    let filename = null;
    if (!pool) {
      filename = `photo-${Date.now()}.jpg`;
      fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(match[2], 'base64'));
    }

    let postgresId = null;
    if (pool) {
      const result = await pool.query(
        'INSERT INTO captures (image_payload) VALUES ($1) RETURNING id',
        [image]
      );
      postgresId = result.rows[0].id;
    }

    res.status(200).json({
      status: 'success',
      message: 'Photo saved.',
      filename,
      storedInPostgres: Boolean(pool),
      id: postgresId
    });
  } catch (error) {
    console.error('Server processing error:', error);
    res.status(500).json({ status: 'error', message: 'Could not save the photo.' });
  }
});

initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('PostgreSQL connection error:', err.message);
    process.exit(1);
  });
