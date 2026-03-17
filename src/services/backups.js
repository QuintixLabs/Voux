/*
  src/services/backups.js

  Automatic + manual database backup service.
*/

function createBackupService(options = {}) {
  const {
    fs,
    path,
    dataDir,
    staticDir,
    uploadsDir,
    requestedBackupDir,
    getConfig,
    createDatabaseBackup,
    exportCounters,
    exportDailyActivity,
    normalizeCounterForExport
  } = options;

  const autoBackupTickMs = 60 * 1000;
  const defaultBackupDir = path.resolve(path.join(dataDir, 'backups'));
  const backupDir = resolveBackupDir(requestedBackupDir || defaultBackupDir);

  let autoBackupTimer = null;
  let autoBackupRunKey = '';
  let autoBackupBusy = false;

  function init() {
    ensureBackupDirIsSafe();
    restartScheduler();
  }

  function getBackupDirectory() {
    return backupDir;
  }

  function isBusy() {
    return autoBackupBusy;
  }

  async function createNow(source = 'manual') {
    if (autoBackupBusy) {
      const error = new Error('backup_busy');
      error.code = 'backup_busy';
      throw error;
    }
    autoBackupBusy = true;
    try {
      return await createAndStoreBackups(source);
    } finally {
      autoBackupBusy = false;
    }
  }

  function restartScheduler() {
    if (autoBackupTimer) {
      clearInterval(autoBackupTimer);
      autoBackupTimer = null;
    }
    autoBackupRunKey = '';
    const schedule = getConfig().autoBackup || {};
    if (!schedule || schedule.frequency === 'off') {
      return;
    }
    autoBackupTimer = setInterval(() => {
      maybeRunScheduledBackup().catch((error) => {
        console.error('Automatic backup failed', error);
      });
    }, autoBackupTickMs);
    maybeRunScheduledBackup().catch((error) => {
      console.error('Automatic backup failed', error);
    });
  }

  async function createAndStoreBackups(source = 'auto') {
    ensureBackupDir();
    const timestamp = buildBackupTimestamp(new Date());
    const schedule = getConfig().autoBackup || {};
    const dbBackup = await createDbBackupFile(timestamp, source);
    let jsonBackup = null;
    if (schedule.includeJson === true) {
      jsonBackup = createJsonBackupFile(timestamp, source);
    }
    const retention = sanitizeBackupRetention(schedule.retention);
    pruneOldBackups(retention, 'db');
    if (jsonBackup) {
      pruneOldBackups(retention, 'json');
    }
    return {
      dbBackup,
      jsonBackup
    };
  }

  async function maybeRunScheduledBackup(now = new Date()) {
    const schedule = getConfig().autoBackup || {};
    if (!schedule || schedule.frequency === 'off') {
      return;
    }
    if (autoBackupBusy) {
      return;
    }
    const [targetHour, targetMinute] = parseBackupTime(schedule.time);
    if (now.getHours() !== targetHour || now.getMinutes() !== targetMinute) {
      return;
    }
    if (schedule.frequency === 'weekly') {
      const targetWeekday = sanitizeBackupWeekday(schedule.weekday);
      if (now.getDay() !== targetWeekday) {
        return;
      }
    }
    const runKey = getBackupRunKey(schedule.frequency, now);
    if (runKey === autoBackupRunKey) {
      return;
    }
    if (hasBackupForScheduledMinute(now)) {
      autoBackupRunKey = runKey;
      return;
    }
    autoBackupBusy = true;
    try {
      await createAndStoreBackups('auto');
      autoBackupRunKey = runKey;
    } finally {
      autoBackupBusy = false;
    }
  }

  async function createDbBackupFile(timestamp, source = 'auto') {
    const fileName = `voux-db-${timestamp}.db`;
    const outputPath = path.join(backupDir, fileName);
    await createDatabaseBackup(outputPath);
    const stat = fs.statSync(outputPath);
    return {
      fileName,
      size: stat.size,
      createdAt: stat.mtimeMs,
      source
    };
  }

  function createJsonBackupFile(timestamp, source = 'auto') {
    const fileName = `voux-export-${timestamp}.json`;
    const outputPath = path.join(backupDir, fileName);
    const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}`;
    const counters = exportCounters()
      .map(normalizeCounterForExport)
      .filter(Boolean);
    const daily = exportDailyActivity();
    const payload = {
      counters,
      daily,
      exportedAt: Date.now()
    };
    try {
      fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tempPath, outputPath);
    } finally {
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          // ignore temp cleanup failures
        }
      }
    }
    const stat = fs.statSync(outputPath);
    return {
      fileName,
      size: stat.size,
      createdAt: stat.mtimeMs,
      source
    };
  }

  function ensureBackupDir() {
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  }

  function ensureBackupDirIsSafe() {
    const blockedRoots = [staticDir, uploadsDir];
    if (blockedRoots.some((root) => isSameOrInsidePath(backupDir, root))) {
      throw new Error(`Unsafe backup directory path: ${backupDir}`);
    }
  }

  function resolveBackupDir(rawPath) {
    const requested = path.resolve(rawPath || defaultBackupDir);
    const blockedRoots = [staticDir, uploadsDir];
    if (blockedRoots.some((root) => isSameOrInsidePath(requested, root))) {
      console.warn(
        `BACKUP_DIR "${requested}" is unsafe (inside a web-served directory). Falling back to ${defaultBackupDir}.`
      );
      return defaultBackupDir;
    }
    return requested;
  }

  function isSameOrInsidePath(targetPath, basePath) {
    const target = path.resolve(targetPath);
    const base = path.resolve(basePath);
    const relative = path.relative(base, target);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function buildBackupTimestamp(date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}-${hour}${minute}${second}`;
  }

  function hasBackupForScheduledMinute(date) {
    try {
      if (!fs.existsSync(backupDir)) return false;
      const dayPrefix = buildBackupDayPrefix(date);
      const minutePrefix = buildBackupMinutePrefix(date);
      const files = fs.readdirSync(backupDir);
      return files.some((file) => {
        if (!file.startsWith(`voux-db-${dayPrefix}-${minutePrefix}`)) {
          return false;
        }
        return file.endsWith('.db');
      });
    } catch {
      return false;
    }
  }

  function buildBackupDayPrefix(date) {
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  function buildBackupMinutePrefix(date) {
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${hour}${minute}`;
  }

  function pruneOldBackups(retention = 7, type = 'db') {
    const keep = sanitizeBackupRetention(retention);
    const pattern = type === 'json'
      ? /^voux-export-\d{8}-\d{6}\.json$/i
      : /^voux-db-\d{8}-\d{6}\.db$/i;
    const files = fs.readdirSync(backupDir)
      .filter((file) => pattern.test(file))
      .map((file) => {
        const fullPath = path.join(backupDir, file);
        const stat = fs.statSync(fullPath);
        return { file, fullPath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(keep).forEach((entry) => {
      try {
        fs.unlinkSync(entry.fullPath);
      } catch (error) {
        console.warn('Failed to prune backup', entry.file, error.message);
      }
    });
  }

  function parseBackupTime(value) {
    const raw = String(value || '').trim();
    if (!/^\d{2}:\d{2}$/.test(raw)) {
      return [3, 0];
    }
    const [hourRaw, minuteRaw] = raw.split(':').map((part) => Number(part));
    const hour = Number.isFinite(hourRaw) ? Math.max(0, Math.min(23, Math.floor(hourRaw))) : 3;
    const minute = Number.isFinite(minuteRaw) ? Math.max(0, Math.min(59, Math.floor(minuteRaw))) : 0;
    return [hour, minute];
  }

  function sanitizeBackupWeekday(value) {
    const weekday = Number(value);
    if (!Number.isFinite(weekday)) return 0;
    return Math.max(0, Math.min(6, Math.floor(weekday)));
  }

  function sanitizeBackupRetention(value) {
    const retention = Number(value);
    if (!Number.isFinite(retention)) return 7;
    return Math.max(1, Math.min(30, Math.round(retention)));
  }

  function getBackupRunKey(frequency, date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    if (frequency === 'weekly') {
      const dayOfWeek = date.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(date);
      monday.setDate(date.getDate() + mondayOffset);
      const mondayMonth = String(monday.getMonth() + 1).padStart(2, '0');
      const mondayDay = String(monday.getDate()).padStart(2, '0');
      return `weekly-${monday.getFullYear()}-${mondayMonth}-${mondayDay}`;
    }
    return `${frequency || 'daily'}-${year}-${month}-${day}`;
  }

  return {
    init,
    isBusy,
    createNow,
    restartScheduler,
    getBackupDirectory
  };
}

module.exports = createBackupService;
