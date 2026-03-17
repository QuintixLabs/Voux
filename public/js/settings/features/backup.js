/*
  settings/features/backup.js

  Manual backup restore/download and automatic backup schedule controls.
*/

/* -------------------------------------------------------------------------- */
/* Backup manager                                                             */
/* -------------------------------------------------------------------------- */
function createBackupManager(deps) {
  const {
    downloadBackupBtn,
    restoreFileInput,
    backupStatusLabel,
    autoBackupSection,
    autoBackupToggle,
    autoBackupSummary,
    autoBackupBody,
    autoBackupPath,
    autoBackupPathValue,
    autoBackupFrequencyInput,
    autoBackupTimeInput,
    autoBackupWeekdayField,
    autoBackupWeekdayInput,
    autoBackupRetentionInput,
    autoBackupIncludeJsonInput,
    saveAutoBackupBtn,
    runAutoBackupNowBtn,
    AUTO_BACKUP_WEEKDAYS,
    authFetch,
    assertSession,
    showToast,
    showAlert,
    normalizeAuthMessage,
    modalConfirm,
    applyConfigUpdate
  } = deps;

  let backupBusy = false;

/* -------------------------------------------------------------------------- */
/* Backup controls wiring                                                     */
/* -------------------------------------------------------------------------- */
function setupBackupControls(canManageAutoBackups = false) {
    downloadBackupBtn?.addEventListener('click', () => handleBackupDownload());
    restoreFileInput?.addEventListener('change', (event) => handleBackupRestore(event));
    if (autoBackupSection) {
      autoBackupSection.classList.toggle('hidden', !canManageAutoBackups);
    }
    if (!canManageAutoBackups) {
      return;
    }
    autoBackupToggle?.addEventListener('click', () => toggleAutoBackupBody());
    autoBackupFrequencyInput?.addEventListener('change', syncAutoBackupUiState);
    autoBackupTimeInput?.addEventListener('pointerdown', handleTimePickerHotspot);
    autoBackupRetentionInput?.addEventListener('input', syncAutoBackupUiState);
    autoBackupTimeInput?.addEventListener('input', syncAutoBackupUiState);
    autoBackupWeekdayInput?.addEventListener('change', syncAutoBackupUiState);
    autoBackupIncludeJsonInput?.addEventListener('change', syncAutoBackupUiState);
    saveAutoBackupBtn?.addEventListener('click', () => handleSaveAutoBackup());
    runAutoBackupNowBtn?.addEventListener('click', () => handleRunAutoBackupNow());
    toggleAutoBackupBody(false);
    syncAutoBackupUiState();
  }

  function handleTimePickerHotspot(event) {
    const input = autoBackupTimeInput;
    if (!input || typeof input.showPicker !== 'function') {
      return;
    }
    const rect = input.getBoundingClientRect();
    const hotspotWidth = 44;
    const isHotspot = event.clientX >= rect.right - hotspotWidth;
    if (!isHotspot) {
      return;
    }
    event.preventDefault();
    try {
      input.showPicker();
    } catch {
      // Ignore if browser blocks programmatic picker.
    }
  }

/* -------------------------------------------------------------------------- */
/* Manual backup actions                                                      */
/* -------------------------------------------------------------------------- */
async function handleBackupDownload() {
    if (backupBusy) {
      showToast('Finish the current backup task first', 'danger');
      return;
    }
    try {
      backupBusy = true;
      if (downloadBackupBtn) downloadBackupBtn.disabled = true;
      setBackupStatus('');
      const res = await authFetch('/api/counters/export');
      await assertSession(res);
      if (!res.ok) throw new Error('Failed to download backup');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.href = url;
      link.download = `voux-backup-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setBackupStatus('');
      showToast('Backup downloaded');
    } catch (error) {
      setBackupStatus('');
      await showAlert(normalizeAuthMessage(error, 'Failed to download backup'));
    } finally {
      backupBusy = false;
      if (downloadBackupBtn) downloadBackupBtn.disabled = false;
    }
  }

  async function handleBackupRestore(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (backupBusy) {
      showToast('Finish the current backup task first', 'danger');
      event.target.value = '';
      return;
    }
    try {
      // setBackupStatus('Reading backup...');
      const text = await file.text();
      const parsed = JSON.parse(text);
      let payload = null;
      let dailyPayload = [];
      let tagCatalogPayload = [];
      if (Array.isArray(parsed)) {
        payload = parsed;
      } else if (parsed && Array.isArray(parsed.counters)) {
        payload = parsed.counters;
        if (Array.isArray(parsed.daily)) {
          dailyPayload = parsed.daily;
        }
        if (Array.isArray(parsed.tagCatalog)) {
          tagCatalogPayload = parsed.tagCatalog;
        }
      }
      if (!payload) throw new Error('Invalid backup file.');
      const confirmed = await modalConfirm({
        title: 'Restore backup?',
        message: 'This will merge the backup counters into your current list.',
        confirmLabel: 'Restore backup'
      });
      if (!confirmed) {
        event.target.value = '';
        setBackupStatus('');
        showToast('Restore canceled', 'danger');
        return;
      }
      // setBackupStatus('Uploading backup...');
      backupBusy = true;
      if (downloadBackupBtn) downloadBackupBtn.disabled = true;
      if (restoreFileInput) restoreFileInput.disabled = true;
      const body = { counters: payload, replace: false };
      if (dailyPayload.length) {
        body.daily = dailyPayload;
      }
      if (tagCatalogPayload.length) {
        body.tagCatalog = tagCatalogPayload;
      }
      const res = await authFetch('/api/counters/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to restore backup');
      }
      const result = await res.json();
      const count = result.imported || payload.length;
      const dailyCount = result.dailyImported || dailyPayload.length || 0;
      setBackupStatus('');
      const message = dailyCount ? `Restored ${count} counters and ${dailyCount} activity rows` : `Restored ${count} counters`;
      showToast(message);
    } catch (error) {
      setBackupStatus('');
      const message = error.message === 'counter_id_taken'
        ? 'One or more counter IDs already exist. Remove them or edit the backup file.'
        : error.message || 'Failed to restore backup';
      await showAlert(normalizeAuthMessage(error, message));
    } finally {
      event.target.value = '';
      backupBusy = false;
      if (downloadBackupBtn) downloadBackupBtn.disabled = false;
      if (restoreFileInput) restoreFileInput.disabled = false;
    }
  }

  function setBackupStatus(message) {
    if (backupStatusLabel) {
      const text = message || '';
      backupStatusLabel.textContent = text;
      backupStatusLabel.classList.toggle('hidden', !text);
    }
  }

/* -------------------------------------------------------------------------- */
/* Auto backup UI state                                                       */
/* -------------------------------------------------------------------------- */
function syncAutoBackupUiState() {
    const frequency = autoBackupFrequencyInput?.value || 'off';
    if (autoBackupWeekdayField) {
      autoBackupWeekdayField.classList.toggle('hidden', frequency !== 'weekly');
    }
    if (autoBackupSummary) {
      const retention = Number(autoBackupRetentionInput?.value || 7);
      const keep = Number.isFinite(retention) ? Math.max(1, Math.min(30, Math.round(retention))) : 7;
      const time = formatTime12h(String(autoBackupTimeInput?.value || '03:00'));
      if (frequency === 'off') {
        autoBackupSummary.textContent = 'Off';
        return;
      }
      const jsonSuffix = autoBackupIncludeJsonInput?.checked ? ' · JSON' : '';
      if (frequency === 'weekly') {
        const weekday = Number(autoBackupWeekdayInput?.value || 0);
        const dayLabel = AUTO_BACKUP_WEEKDAYS[Math.max(0, Math.min(6, Math.floor(weekday)))] || 'Sunday';
        autoBackupSummary.textContent = `Weekly · ${dayLabel} · ${time} · Keep ${keep}${jsonSuffix}`;
        return;
      }
      autoBackupSummary.textContent = `Daily · ${time} · Keep ${keep}${jsonSuffix}`;
    }
  }

  function formatTime12h(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) {
      return '03:00 AM';
    }
    const hour24 = Math.max(0, Math.min(23, Number(match[1])));
    const minute = String(Math.max(0, Math.min(59, Number(match[2])))).padStart(2, '0');
    const suffix = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${minute} ${suffix}`;
  }

  function toggleAutoBackupBody(forceOpen) {
    if (!autoBackupBody || !autoBackupToggle) return;
    const nextOpen = typeof forceOpen === 'boolean'
      ? forceOpen
      : !autoBackupBody.classList.contains('is-open');
    const onTransitionEnd = (event) => {
      if (event.target !== autoBackupBody || event.propertyName !== 'height') return;
      if (autoBackupBody.classList.contains('is-open')) {
        autoBackupBody.style.height = 'auto';
      }
      autoBackupBody.removeEventListener('transitionend', onTransitionEnd);
    };
    autoBackupBody.removeEventListener('transitionend', onTransitionEnd);
    if (nextOpen) {
      autoBackupBody.classList.add('is-open');
      autoBackupToggle.setAttribute('aria-expanded', 'true');
      autoBackupBody.style.height = '0px';
      void autoBackupBody.offsetHeight;
      autoBackupBody.style.height = `${autoBackupBody.scrollHeight}px`;
      autoBackupBody.addEventListener('transitionend', onTransitionEnd);
      return;
    }
    autoBackupToggle.setAttribute('aria-expanded', 'false');
    autoBackupBody.style.height = `${autoBackupBody.scrollHeight}px`;
    void autoBackupBody.offsetHeight;
    autoBackupBody.classList.remove('is-open');
    autoBackupBody.style.height = '0px';
  }

  function applyAutoBackupForm(autoBackup = {}) {
    if (autoBackupFrequencyInput) {
      const frequency = ['off', 'daily', 'weekly'].includes(autoBackup.frequency) ? autoBackup.frequency : 'off';
      autoBackupFrequencyInput.value = frequency;
    }
    if (autoBackupTimeInput) {
      const time = typeof autoBackup.time === 'string' && /^\d{2}:\d{2}$/.test(autoBackup.time)
        ? autoBackup.time
        : '03:00';
      autoBackupTimeInput.value = time;
    }
    if (autoBackupWeekdayInput) {
      const weekday = Number(autoBackup.weekday);
      autoBackupWeekdayInput.value = Number.isFinite(weekday) ? String(Math.max(0, Math.min(6, Math.floor(weekday)))) : '0';
    }
    if (autoBackupRetentionInput) {
      const retention = Number(autoBackup.retention);
      const safeRetention = Number.isFinite(retention) ? Math.max(1, Math.min(30, Math.round(retention))) : 7;
      autoBackupRetentionInput.value = String(safeRetention);
    }
    if (autoBackupIncludeJsonInput) {
      autoBackupIncludeJsonInput.checked = autoBackup.includeJson === true;
    }
    syncAutoBackupUiState();
  }

  function applyAutoBackupPath(rawPath) {
    if (!autoBackupPath || !autoBackupPathValue) return;
    const value = typeof rawPath === 'string' && rawPath.trim() ? rawPath.trim() : './data/backups';
    autoBackupPathValue.textContent = value;
    autoBackupPath.title = value;
  }

  function collectAutoBackupPayload() {
    const frequency = ['off', 'daily', 'weekly'].includes(autoBackupFrequencyInput?.value)
      ? autoBackupFrequencyInput.value
      : 'off';
    const time = String(autoBackupTimeInput?.value || '03:00').trim();
    const weekday = Number(autoBackupWeekdayInput?.value || 0);
    const retention = Number(autoBackupRetentionInput?.value || 7);
    return {
      frequency,
      time: /^\d{2}:\d{2}$/.test(time) ? time : '03:00',
      weekday: Number.isFinite(weekday) ? Math.max(0, Math.min(6, Math.floor(weekday))) : 0,
      retention: Number.isFinite(retention) ? Math.max(1, Math.min(30, Math.round(retention))) : 7,
      includeJson: autoBackupIncludeJsonInput?.checked === true
    };
  }

/* -------------------------------------------------------------------------- */
/* Auto backup actions                                                        */
/* -------------------------------------------------------------------------- */
async function handleSaveAutoBackup() {
    if (!saveAutoBackupBtn) return;
    const payload = collectAutoBackupPayload();
    try {
      saveAutoBackupBtn.disabled = true;
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoBackup: payload })
      });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save backup schedule');
      }
      const data = await res.json().catch(() => ({}));
      applyConfigUpdate(data);
      applyAutoBackupForm(data?.config?.autoBackup || payload);
      setBackupStatus('');
      showToast('Automatic backup schedule saved');
    } catch (error) {
      setBackupStatus('');
      await showAlert(normalizeAuthMessage(error, 'Failed to save backup schedule'));
    } finally {
      saveAutoBackupBtn.disabled = false;
    }
  }

  async function handleRunAutoBackupNow() {
    if (!runAutoBackupNowBtn) return;
    if (backupBusy) {
      showToast('Finish the current backup task first', 'danger');
      return;
    }
    try {
      backupBusy = true;
      runAutoBackupNowBtn.disabled = true;
      const res = await authFetch('/api/backups/run', { method: 'POST' });
      await assertSession(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to run DB backup');
      }
      const data = await res.json().catch(() => ({}));
      const fileName = data?.backup?.fileName || 'database backup';
      const jsonName = data?.jsonBackup?.fileName || '';
      setBackupStatus('');
      showToast(jsonName ? `DB + JSON backups created: ${fileName}` : `DB backup created: ${fileName}`);
    } catch (error) {
      setBackupStatus('');
      await showAlert(normalizeAuthMessage(error, 'Failed to run DB backup'));
    } finally {
      backupBusy = false;
      runAutoBackupNowBtn.disabled = false;
    }
  }

  return {
    setupBackupControls,
    applyAutoBackupForm,
    applyAutoBackupPath
  };
}

export {
  createBackupManager
};
