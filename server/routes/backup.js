const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// One-click backup trigger for the local SQLite database. Wraps the existing
// scripts/backup-db.sh shell script so the timestamped-rotation logic stays in
// one place; the route is just the HTTP shim.
module.exports = function makeBackupRoutes(deps) {
  const { authenticateToken, sendServerError } = deps;
  const router = express.Router();
  const scriptPath = path.join(__dirname, '..', 'scripts', 'backup-db.sh');
  const backupDir = path.join(__dirname, '..', 'backups');

  router.post('/run', authenticateToken, (req, res) => {
    const child = spawn('bash', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', code => {
      if (code !== 0) return sendServerError(res, new Error(err || `exit ${code}`), 'Backup failed');
      res.json({ ok: true, log: out });
    });
  });

  router.get('/list', authenticateToken, (req, res) => {
    if (!fs.existsSync(backupDir)) return res.json({ backups: [] });
    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(backupDir, f));
        return { name: f, size: stat.size, modified: stat.mtime.toISOString() };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    res.json({ backups: files });
  });

  return router;
};
