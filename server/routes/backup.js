const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// One-click backup trigger for the local SQLite database. Wraps the existing
// scripts/backup-db.sh shell script so the timestamped-rotation logic stays
// in one place; the route is just the HTTP shim.
//
// IMPORTANT: backup-db.sh dumps the ENTIRE multi-tenant SQLite file, not a
// per-user slice. Listing existing backups by name leaks the existence of
// other users' data and is admin-only. Triggering a new backup is restricted
// to admins too, since it's a server-global write. Comma-separated user ids
// in the ADMIN_USER_IDS env. Empty list = single-tenant mode (current default
// for the personal-use deployment, where any logged-in user IS the admin).
module.exports = function makeBackupRoutes(deps) {
  const { authenticateToken, sendServerError } = deps;
  const router = express.Router();
  const scriptPath = path.join(__dirname, '..', 'scripts', 'backup-db.sh');
  const backupDir = path.join(__dirname, '..', 'backups');

  const adminIds = new Set(
    (process.env.ADMIN_USER_IDS || '')
      .split(',').map(s => s.trim()).filter(Boolean).map(Number)
  );
  function isAdmin(req) {
    // Empty list → single-tenant mode → any authenticated user is the admin.
    if (adminIds.size === 0) return true;
    return adminIds.has(Number(req.user.userId));
  }
  function requireAdmin(req, res, next) {
    if (!isAdmin(req)) return res.status(403).json({ error: 'Backup operations require admin' });
    next();
  }

  router.post('/run', authenticateToken, requireAdmin, (req, res) => {
    const child = spawn('bash', [scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('close', code => {
      if (code !== 0) return sendServerError(res, new Error(err || `exit ${code}`), 'Backup failed');
      res.json({ ok: true, log: out });
    });
  });

  router.get('/list', authenticateToken, requireAdmin, (req, res) => {
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
