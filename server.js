const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Directly added your Supabase connection string inside the code
const databaseUrl = "postgresql://postgres.vfwpitammjochxwtaxp:[YOUR-PASSWORD]@://supabase.com";

app.set('trust proxy', 1);
app.use(express.json({ limit: '10mb' }));
