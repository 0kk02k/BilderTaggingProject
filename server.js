import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs, existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = 3004;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use('/images', express.static(join(__dirname, 'public/images')));

// Database setup
const dbPath = join(__dirname, 'images.db');
const sqlite = sqlite3.verbose();
const db = new sqlite.Database(dbPath);

// Promisify database operations
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

// Create tables if not exists
dbRun(`
  CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    text_content TEXT,
    image_data TEXT,
    hash TEXT,
    status TEXT DEFAULT 'temporary',
    source_folder TEXT,
    date_of_entry DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).catch(console.error);

// Hilfsfunktion zum Generieren eines MD5-Hashes
const generateHash = (base64Data) => {
  const cleanData = base64Data.split(';base64,').pop();
  return createHash('md5').update(cleanData).digest('hex');
};

// Hilfsfunktion zum Speichern des Base64-Bildes
const saveBase64Image = async (base64Data, filename) => {
  const base64Image = base64Data.split(';base64,').pop();
  const imagesDir = join(__dirname, 'public', 'images');
  
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }
  
  const filePath = join(imagesDir, filename);
  await fs.writeFile(filePath, base64Image, { encoding: 'base64' });
  return filePath;
};

// Hilfsfunktion zum Löschen eines Bildes
const deleteImageFile = async (filename) => {
  const filePath = join(__dirname, 'public', 'images', filename);
  if (existsSync(filePath)) {
    await fs.unlink(filePath);
  }
};

// Routes
app.post('/api/images', async (req, res) => {
  try {
    const { filename, textContent, imageData, sourceFolder } = req.body;
    
    // Generiere Hash für Duplikatserkennung
    const hash = generateHash(imageData);
    
    // Prüfe auf Duplikate anhand des Hashes
    const duplicate = await dbGet(
      'SELECT id, filename FROM images WHERE hash = ?',
      [hash]
    );
    
    if (duplicate) {
      return res.status(409).json({ 
        error: 'Duplicate image', 
        message: `Dieses Bild existiert bereits als "${duplicate.filename}"`,
        duplicateId: duplicate.id
      });
    }

    // Speichere das Bild
    if (imageData) {
      await saveBase64Image(imageData, filename);
    }

    const result = await dbRun(
      'INSERT INTO images (filename, text_content, hash, status, source_folder, date_of_entry) VALUES (?, ?, ?, ?, ?, datetime("now", "localtime"))',
      [filename, textContent, hash, 'temporary', sourceFolder]
    );
    res.json({ id: result.lastID });
  } catch (error) {
    console.error('Error inserting image:', error);
    res.status(500).json({ error: 'Failed to insert image' });
  }
});

app.get('/api/images', async (req, res) => {
  try {
    const images = await dbAll(`
      SELECT 
        id, 
        filename, 
        text_content, 
        status, 
        source_folder,
        date_of_entry,
        created_at
      FROM images 
      ORDER BY date_of_entry DESC
    `);
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images' });
  }
});

app.post('/api/images/approve', async (req, res) => {
  try {
    const { id } = req.body;
    await dbRun(
      'UPDATE images SET status = ? WHERE id = ?',
      ['approved', id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error approving image:', error);
    res.status(500).json({ error: 'Failed to approve image' });
  }
});

app.post('/api/images/reanalyze', async (req, res) => {
  try {
    const { id, filename, newKeywords } = req.body;
    await dbRun(
      'UPDATE images SET text_content = ?, status = ? WHERE id = ?',
      [newKeywords, 'temporary', id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating analysis:', error);
    res.status(500).json({ error: 'Failed to update analysis' });
  }
});

app.delete('/api/images/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Hole Bildinformationen
    const image = await dbGet('SELECT filename FROM images WHERE id = ?', [id]);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Lösche Bilddatei
    await deleteImageFile(image.filename);

    // Lösche Datenbankeintrag
    await dbRun('DELETE FROM images WHERE id = ?', [id]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image' });
  }
});

app.get('/api/images/check-duplicate', async (req, res) => {
  try {
    const { imageData } = req.query;
    const hash = generateHash(imageData);
    const duplicate = await dbGet(
      'SELECT id, filename FROM images WHERE hash = ?',
      [hash]
    );
    res.json({ 
      isDuplicate: !!duplicate,
      duplicateInfo: duplicate
    });
  } catch (error) {
    console.error('Error checking duplicate:', error);
    res.status(500).json({ error: 'Failed to check duplicate' });
  }
});

app.get('/api/available-images', async (req, res) => {
  const imagesDir = join(__dirname, 'public', 'images');
  
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }

  try {
    const files = await fs.readdir(imagesDir);
    const imageFiles = files.filter(file => 
      ['.jpg', '.jpeg', '.png', '.gif'].includes(join(file).toLowerCase())
    );
    res.json(imageFiles);
  } catch (err) {
    console.error('Error reading images directory:', err);
    res.status(500).json({ error: 'Unable to read images directory' });
  }
});

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});
