const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const fs = require('fs');
const crypto = require('crypto');
const { exec } = require('child_process');

const expressApp = express();

expressApp.use(express.json({ limit: '10mb' }));
expressApp.use(express.urlencoded({ extended: true, limit: '10mb' }));

const publicPath = path.join(__dirname, 'public');
expressApp.use(express.static(publicPath));

// Active scan cancellation tracking
let activeScanId = null;

// Helper: Calculate partial hash
function getPartialHash(filePath, fileSize) {
  return new Promise((resolve) => {
    const CHUNK_SIZE = 4096;
    const hash = crypto.createHash('md5');
    
    if (fileSize <= CHUNK_SIZE * 2) {
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => resolve(null));
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      return;
    }

    const buffers = [];
    const readStream = fs.createReadStream(filePath, { start: 0, end: CHUNK_SIZE - 1 });
    readStream.on('error', () => resolve(null));
    readStream.on('data', chunk => buffers.push(chunk));
    readStream.on('end', () => {
      const endStream = fs.createReadStream(filePath, { start: fileSize - CHUNK_SIZE, end: fileSize - 1 });
      endStream.on('error', () => resolve(null));
      endStream.on('data', chunk => buffers.push(chunk));
      endStream.on('end', () => {
        buffers.forEach(b => hash.update(b));
        hash.update(String(fileSize));
        resolve(hash.digest('hex'));
      });
    });
  });
}

// Helper: Calculate full SHA-256 hash
function getFullHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

// Batch processor with concurrency limit
async function asyncPool(limit, array, fn, isCancelled) {
  const results = [];
  const executing = [];
  for (const item of array) {
    if (isCancelled && isCancelled()) break;
    const p = Promise.resolve().then(() => fn(item));
    results.push(p);
    if (limit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= limit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

// File category helper
function matchesCategory(filename, category) {
  if (!category || category === 'all') return true;
  const ext = path.extname(filename).toLowerCase();
  const images = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg', '.ico', '.tiff'];
  const videos = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.3gp'];
  const docs = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.odt', '.rtf', '.csv', '.md'];

  if (category === 'images') return images.includes(ext);
  if (category === 'videos') return videos.includes(ext);
  if (category === 'docs') return docs.includes(ext);
  return true;
}

// Recursive directory walker with filters and live progress
async function walkDir(dir, fileList = [], skipSystem = true, minSize = 0, category = 'all', scanId, onProgress) {
  if (activeScanId !== scanId) return fileList;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (activeScanId !== scanId) break;
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          if (skipSystem) {
            const skipDirs = [
              'node_modules', '.git', '.svn', '$recycle.bin', 'system volume information',
              'windows', 'program files', 'program files (x86)', 'appdata',
              'application data', 'programdata', 'recovery', 'perflogs',
              'config.msi', 'msocache', 'thumbs.db'
            ];
            if (skipDirs.includes(entry.name.toLowerCase())) {
              continue;
            }
          }
          if (onProgress) onProgress(fullPath, fileList.length);
          await walkDir(fullPath, fileList, skipSystem, minSize, category, scanId, onProgress);
        } else if (entry.isFile()) {
          const stats = await fs.promises.stat(fullPath);
          if (stats.size >= minSize && matchesCategory(entry.name, category)) {
            fileList.push({
              path: fullPath,
              name: entry.name,
              size: stats.size,
              mtime: stats.mtime
            });
            if (onProgress && fileList.length % 200 === 0) {
              onProgress(fullPath, fileList.length);
            }
          }
        }
      } catch (err) {}
    }
  } catch (err) {}
  return fileList;
}

// API: Browse filesystem
expressApp.post('/api/browse', async (req, res) => {
  let { dirPath } = req.body;
  try {
    if (!dirPath || dirPath.trim() === '') {
      if (process.platform === 'win32') {
        const drives = [];
        for (let i = 65; i <= 90; i++) {
          const driveLetter = String.fromCharCode(i) + ':\\';
          try {
            if (fs.existsSync(driveLetter)) {
              drives.push({ name: driveLetter, path: driveLetter, isDirectory: true });
            }
          } catch (e) {}
        }
        return res.json({ success: true, currentPath: '', parentPath: '', items: drives });
      } else {
        dirPath = '/';
      }
    }

    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ error: 'Path does not exist.' });
    }

    const stats = await fs.promises.stat(resolved);
    if (!stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory.' });
    }

    const entries = await fs.promises.readdir(resolved, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        items.push({
          name: entry.name,
          path: path.join(resolved, entry.name),
          isDirectory: true
        });
      }
    }
    items.sort((a, b) => a.name.localeCompare(b.name));
    const parentPath = path.dirname(resolved);

    res.json({
      success: true,
      currentPath: resolved,
      parentPath: parentPath !== resolved ? parentPath : null,
      items
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Cancel Scan
expressApp.post('/api/cancel-scan', (req, res) => {
  activeScanId = null;
  res.json({ success: true });
});

// API: Scan directory
expressApp.post('/api/scan', async (req, res) => {
  const { dirPath, skipSystem = true, minSize = 0, category = 'all' } = req.body;
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'Valid directory path is required.' });
  }

  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ error: 'Directory does not exist.' });
  }

  const scanId = crypto.randomUUID();
  activeScanId = scanId;

  try {
    const startTime = Date.now();
    const files = await walkDir(resolvedPath, [], skipSystem, minSize, category, scanId, (currentDir, count) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('scan-progress', { currentDir, count });
      }
    });

    if (activeScanId !== scanId) {
      return res.json({ success: false, cancelled: true });
    }

    const sizeMap = new Map();
    for (const file of files) {
      if (file.size === 0) continue;
      if (!sizeMap.has(file.size)) {
        sizeMap.set(file.size, []);
      }
      sizeMap.get(file.size).push(file);
    }

    const potentialBySize = [];
    for (const [size, group] of sizeMap.entries()) {
      if (group.length > 1) {
        potentialBySize.push(...group);
      }
    }

    if (activeScanId !== scanId) return res.json({ success: false, cancelled: true });

    const partialMap = new Map();
    await asyncPool(32, potentialBySize, async (file) => {
      if (activeScanId !== scanId) return;
      const partialHash = await getPartialHash(file.path, file.size);
      if (partialHash) {
        file.partialHash = partialHash;
        const key = `${file.size}_${partialHash}`;
        if (!partialMap.has(key)) {
          partialMap.set(key, []);
        }
        partialMap.get(key).push(file);
      }
    }, () => activeScanId !== scanId);

    if (activeScanId !== scanId) return res.json({ success: false, cancelled: true });

    const potentialByPartial = [];
    for (const [key, group] of partialMap.entries()) {
      if (group.length > 1) {
        potentialByPartial.push(...group);
      }
    }

    const fullHashMap = new Map();
    await asyncPool(16, potentialByPartial, async (file) => {
      if (activeScanId !== scanId) return;
      try {
        const fullHash = await getFullHash(file.path);
        file.hash = fullHash;
        if (!fullHashMap.has(fullHash)) {
          fullHashMap.set(fullHash, []);
        }
        fullHashMap.get(fullHash).push(file);
      } catch (err) {}
    }, () => activeScanId !== scanId);

    if (activeScanId !== scanId) return res.json({ success: false, cancelled: true });

    const duplicateGroups = [];
    let totalWastedBytes = 0;
    let duplicateFilesCount = 0;

    for (const [hash, group] of fullHashMap.entries()) {
      if (group.length > 1) {
        group.sort((a, b) => new Date(a.mtime) - new Date(b.mtime));
        const wastedBytes = group.slice(1).reduce((acc, f) => acc + f.size, 0);
        totalWastedBytes += wastedBytes;
        duplicateFilesCount += (group.length - 1);

        duplicateGroups.push({
          hash,
          size: group[0].size,
          count: group.length,
          wastedBytes,
          files: group
        });
      }
    }

    duplicateGroups.sort((a, b) => b.wastedBytes - a.wastedBytes);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    res.json({
      success: true,
      stats: {
        totalFilesScanned: files.length,
        duplicateGroupsCount: duplicateGroups.length,
        duplicateFilesCount,
        totalWastedBytes,
        durationSeconds: duration
      },
      groups: duplicateGroups
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: File Preview
expressApp.get('/api/preview', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }
  try {
    const ext = path.extname(filePath).toLowerCase();
    const images = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'];
    const videos = ['.mp4', '.webm', '.ogg', '.mkv', '.avi'];
    const audio = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

    if (images.includes(ext) || videos.includes(ext) || audio.includes(ext)) {
      res.sendFile(filePath);
    } else {
      const content = await fs.promises.readFile(filePath, 'utf8');
      res.send(content.slice(0, 5000)); // First 5000 chars for text docs
    }
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// Helper: Recycle Bin
function moveToRecycleBin(filePath) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const escapedPath = filePath.replace(/"/g, '`"');
      const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escapedPath}', 'OnlyErrorDialogs', 'SendToRecycleBin')"`;
      exec(psCommand, (error) => {
        if (error) {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) reject(unlinkErr);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    } else {
      fs.unlink(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

// API: Delete
expressApp.post('/api/delete', async (req, res) => {
  const { filePaths, permanent = false } = req.body;
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return res.status(400).json({ error: 'Array of file paths is required.' });
  }

  let deletedCount = 0;
  let freedBytes = 0;
  const results = [];

  for (const filePath of filePaths) {
    try {
      const resolved = path.resolve(filePath);
      if (fs.existsSync(resolved)) {
        const stats = await fs.promises.stat(resolved);
        if (permanent) {
          await fs.promises.unlink(resolved);
        } else {
          await moveToRecycleBin(resolved);
        }
        deletedCount++;
        freedBytes += stats.size;
        results.push({ path: filePath, success: true });
      } else {
        results.push({ path: filePath, success: false, error: 'File not found' });
      }
    } catch (err) {
      results.push({ path: filePath, success: false, error: err.message });
    }
  }

  res.json({ success: true, deletedCount, freedBytes, results });
});

// API: Default paths
expressApp.get('/api/paths', (req, res) => {
  const defaultPath = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname);
  res.json({
    defaultPath,
    homePath: process.env.USERPROFILE || process.env.HOME || ''
  });
});

let mainWindow;
let serverPort = 3000;

function startExpressAndCreateWindow() {
  const server = expressApp.listen(0, () => {
    serverPort = server.address().port;
    
    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      title: 'Duplicate File Detector Pro',
      backgroundColor: '#090d16',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      },
      autoHideMenuBar: true
    });

    mainWindow.loadURL(`http://localhost:${serverPort}`);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });
}

app.whenReady().then(startExpressAndCreateWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
