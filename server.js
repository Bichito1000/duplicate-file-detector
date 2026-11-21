const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Robust static file serving supporting both Node.js and pkg executable snapshots
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// Helper: Calculate partial hash (first 4KB + last 4KB + size) for blazing fast initial filtering
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

// Helper: Calculate full SHA-256 hash for 100% accuracy verification
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
async function asyncPool(limit, array, fn) {
  const results = [];
  const executing = [];
  for (const item of array) {
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

// Recursive directory walker with optional system folder exclusions
async function walkDir(dir, fileList = [], skipSystem = true, onProgress) {
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
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
          await walkDir(fullPath, fileList, skipSystem, onProgress);
        } else if (entry.isFile()) {
          const stats = await fs.promises.stat(fullPath);
          fileList.push({
            path: fullPath,
            name: entry.name,
            size: stats.size,
            mtime: stats.mtime
          });
          if (onProgress && fileList.length % 500 === 0) {
            onProgress(fileList.length);
          }
        }
      } catch (err) {
        // Skip inaccessible files
      }
    }
  } catch (err) {
    // Skip inaccessible directories
  }
  return fileList;
}

// API: Browse filesystem for interactive path explorer
app.post('/api/browse', async (req, res) => {
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
        const fullPath = path.join(resolved, entry.name);
        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory: true
        });
      }
    }

    items.sort((a, b) => a.name.localeCompare(b.name));

    const parentPath = path.dirname(resolved);
    const hasParent = parentPath !== resolved;

    res.json({
      success: true,
      currentPath: resolved,
      parentPath: hasParent ? parentPath : null,
      items
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Scan directory
app.post('/api/scan', async (req, res) => {
  const { dirPath, skipSystem = true } = req.body;
  if (!dirPath || typeof dirPath !== 'string') {
    return res.status(400).json({ error: 'Valid directory path is required.' });
  }

  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    return res.status(404).json({ error: 'Directory does not exist.' });
  }

  try {
    const startTime = Date.now();
    console.log(`[Scan] Starting scan for: ${resolvedPath} (SkipSystem: ${skipSystem})`);

    const files = await walkDir(resolvedPath, [], skipSystem, (count) => {
      console.log(`[Scan] Discovered ${count} files...`);
    });

    console.log(`[Scan] Total files found: ${files.length}. Grouping by size...`);

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

    console.log(`[Scan] Files with matching sizes: ${potentialBySize.length}. Calculating partial hashes...`);

    const partialMap = new Map();
    await asyncPool(32, potentialBySize, async (file) => {
      const partialHash = await getPartialHash(file.path, file.size);
      if (partialHash) {
        file.partialHash = partialHash;
        const key = `${file.size}_${partialHash}`;
        if (!partialMap.has(key)) {
          partialMap.set(key, []);
        }
        partialMap.get(key).push(file);
      }
    });

    const potentialByPartial = [];
    for (const [key, group] of partialMap.entries()) {
      if (group.length > 1) {
        potentialByPartial.push(...group);
      }
    }

    console.log(`[Scan] Files passing partial hash: ${potentialByPartial.length}. Verifying with full SHA-256...`);

    const fullHashMap = new Map();
    await asyncPool(16, potentialByPartial, async (file) => {
      try {
        const fullHash = await getFullHash(file.path);
        file.hash = fullHash;
        if (!fullHashMap.has(fullHash)) {
          fullHashMap.set(fullHash, []);
        }
        fullHashMap.get(fullHash).push(file);
      } catch (err) {}
    });

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
    console.log(`[Scan] Complete in ${duration}s. Found ${duplicateGroups.length} duplicate groups.`);

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
    console.error('[Scan Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper: Move file to Windows Recycle Bin safely using PowerShell VisualBasic FileIO
function moveToRecycleBin(filePath) {
  return new Promise((resolve, reject) => {
    if (process.platform === 'win32') {
      const escapedPath = filePath.replace(/"/g, '`"');
      const psCommand = `powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('${escapedPath}', 'OnlyErrorDialogs', 'SendToRecycleBin')"`;
      exec(psCommand, (error, stdout, stderr) => {
        if (error) {
          // Fallback to permanent unlink if recycle bin fails
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) reject(unlinkErr);
            else resolve();
          });
        } else {
          resolve();
        }
      });
    } else {
      // Non-Windows fallback to unlink
      fs.unlink(filePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }
  });
}

// API: Delete / Recycle files
app.post('/api/delete', async (req, res) => {
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
app.get('/api/paths', (req, res) => {
  const defaultPath = process.pkg ? path.dirname(process.execPath) : path.resolve(__dirname);
  res.json({
    defaultPath,
    homePath: process.env.USERPROFILE || process.env.HOME || ''
  });
});

// Start server with dynamic port finding and auto-opening browser
const INITIAL_PORT = 3000;

function startServer(port) {
  const server = app.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`Duplicate File Detector Pro running at ${url}`);
    
    // Auto-open browser on startup
    const startCmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
    exec(startCmd, (err) => {
      if (err) console.log(`Could not open browser automatically. Please open ${url} manually.`);
    });
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is busy, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(INITIAL_PORT);
