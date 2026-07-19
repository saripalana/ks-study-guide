(function () {
  'use strict';

  const Config = window.BoardsConfig;
  if (!Config) throw new Error('BoardsConfig must load before BoardsStore.');

  const knownKeys = new Set(Config.storage.backupKeys.concat([Config.storage.keys.driveSettings]));
  const subscribers = new Set();

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return clone(fallback);
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Could not read stored value:', key, error);
      return clone(fallback);
    }
  }

  function emit(detail) {
    const payload = Object.assign({ timestamp: Date.now(), bankId: Config.bank.id }, detail || {});
    subscribers.forEach(function (handler) {
      try { handler(payload); } catch (error) { console.error(error); }
    });
    window.dispatchEvent(new CustomEvent(Config.events.storageChanged, { detail: payload }));
  }

  function write(key, value, options) {
    localStorage.setItem(key, JSON.stringify(value));
    emit({ action: 'write', key: key, reason: options && options.reason });
    return value;
  }

  function remove(key, options) {
    localStorage.removeItem(key);
    emit({ action: 'remove', key: key, reason: options && options.reason });
  }

  function update(key, fallback, updater, options) {
    const current = read(key, fallback);
    const next = updater(current);
    return write(key, next === undefined ? current : next, options);
  }

  function subscribe(handler) {
    subscribers.add(handler);
    return function unsubscribe() { subscribers.delete(handler); };
  }

  function milestone(reason, metadata) {
    window.dispatchEvent(new CustomEvent(Config.events.milestone, {
      detail: { reason: reason || 'Study milestone', metadata: Object.assign({ bankId: Config.bank.id }, metadata || {}), timestamp: Date.now(), bankId: Config.bank.id }
    }));
  }

  function sortedBackupKeys(includeLocalRecovery) {
    return Config.storage.backupKeys.filter(function (key) {
      return includeLocalRecovery || key !== Config.storage.keys.localBackups;
    }).slice().sort();
  }

  function canonicalData(data) {
    const sorted = {};
    Object.keys(data || {}).sort().forEach(function (key) { sorted[key] = data[key]; });
    return JSON.stringify(sorted);
  }

  function hashString(input) {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }

  function captureSnapshot(reason, includeLocalRecovery, kind) {
    const data = {};
    sortedBackupKeys(!!includeLocalRecovery).forEach(function (key) {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        if (key === Config.storage.keys.app) data[key] = {};
        return;
      }
      try { data[key] = JSON.parse(raw); }
      catch (error) { data[key] = { __raw: raw }; }
    });
    const canonical = canonicalData(data);
    return {
      schemaVersion: Config.schemaVersion,
      projectId: Config.projectId,
      app: 'ks-study-guide',
      bankId: Config.bank.id,
      bankTitle: Config.bank.title,
      bankQuestionHash: Config.bank.questionHash,
      storageNamespace: Config.bank.storageNamespace,
      kind: kind || (includeLocalRecovery ? 'current' : 'history'),
      createdAt: Date.now(),
      reason: reason || 'Backup',
      origin: window.location.origin,
      hash: hashString(canonical),
      data: data
    };
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') throw new Error('Backup is not a valid object.');
    let data = null;

    if (snapshot.data && typeof snapshot.data === 'object') {
      data = snapshot.data;
    } else if (snapshot.keys && typeof snapshot.keys === 'object') {
      data = {};
      Object.keys(snapshot.keys).forEach(function (key) {
        const raw = snapshot.keys[key];
        if (raw === null || raw === undefined) return;
        try { data[key] = JSON.parse(raw); }
        catch (error) { data[key] = { __raw: String(raw) }; }
      });
    } else if (snapshot.snapshot && typeof snapshot.snapshot === 'object') {
      data = {};
      Object.keys(snapshot.snapshot).forEach(function (key) {
        const raw = snapshot.snapshot[key];
        if (raw === null || raw === undefined) return;
        try { data[key] = JSON.parse(raw); }
        catch (error) { data[key] = { __raw: String(raw) }; }
      });
    } else {
      throw new Error('Backup does not contain stored study data.');
    }

    const projectId = snapshot.projectId || Config.projectId;
    if (projectId !== Config.projectId) throw new Error('Backup belongs to a different project.');

    const explicitBankId = String(snapshot.bankId || (snapshot.bank && snapshot.bank.id) || '').trim().toLowerCase();
    const snapshotBankId = explicitBankId || (Config.bank.legacyStorage ? Config.bank.id : '');
    if (!snapshotBankId) throw new Error('Backup has no question-bank identity and cannot be restored safely.');
    if (snapshotBankId !== Config.bank.id) {
      throw new Error('Backup belongs to ' + (snapshot.bankTitle || snapshotBankId) + ', not the active ' + Config.bank.title + '. Switch banks before restoring it.');
    }

    const safeData = {};
    Object.keys(data).forEach(function (key) {
      if (Config.storage.backupKeys.indexOf(key) >= 0) safeData[key] = data[key];
    });
    if (!Object.keys(safeData).length) throw new Error('Backup contains no recognized study-data keys for ' + Config.bank.title + '.');

    return {
      schemaVersion: Number(snapshot.schemaVersion) || 1,
      projectId: Config.projectId,
      app: snapshot.app || 'ks-study-guide',
      bankId: Config.bank.id,
      bankTitle: snapshot.bankTitle || Config.bank.title,
      bankQuestionHash: snapshot.bankQuestionHash || '',
      storageNamespace: Config.bank.storageNamespace,
      kind: snapshot.kind || 'history',
      createdAt: Number(snapshot.createdAt) || Date.now(),
      reason: snapshot.reason || 'Imported backup',
      origin: snapshot.origin || '',
      hash: hashString(canonicalData(safeData)),
      data: safeData
    };
  }

  function applySnapshot(snapshot, options) {
    const normalized = normalizeSnapshot(snapshot);
    const preserve = new Set((options && options.preserveKeys) || []);
    Config.storage.backupKeys.forEach(function (key) {
      if (!preserve.has(key)) localStorage.removeItem(key);
    });
    Object.keys(normalized.data).forEach(function (key) {
      if (preserve.has(key)) return;
      const value = normalized.data[key];
      if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '__raw')) {
        localStorage.setItem(key, String(value.__raw));
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    });
    emit({ action: 'restore', key: '*', reason: normalized.reason });
    return normalized;
  }

  function exportRawMap(keys) {
    const output = {};
    (keys || Config.storage.backupKeys).forEach(function (key) {
      const value = localStorage.getItem(key);
      if (value !== null) output[key] = value;
    });
    return output;
  }

  window.addEventListener('storage', function (event) {
    if (!event.key || (!knownKeys.has(event.key) && event.key.indexOf(Config.bank.storageNamespace || 'ksBoards') !== 0)) return;
    emit({ action: event.newValue === null ? 'remove' : 'external-write', key: event.key, source: 'storage-event' });
  });

  window.BoardsStore = Object.freeze({
    read: read,
    write: write,
    remove: remove,
    update: update,
    subscribe: subscribe,
    milestone: milestone,
    captureSnapshot: captureSnapshot,
    normalizeSnapshot: normalizeSnapshot,
    applySnapshot: applySnapshot,
    exportRawMap: exportRawMap,
    hashString: hashString,
    canonicalData: canonicalData
  });
})();