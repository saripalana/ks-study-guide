(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const Store = window.BoardsStore;
  const C = window.BoardsCore;
  const BaseModel = window.BoardsQuestionBankModel;
  const Banks = window.BoardsQuestionBankRegistry;
  if (!Config || !Store || !C || !BaseModel || !Banks) throw new Error('Bank consistency dependencies are unavailable.');

  const Bank = Config.bank;
  const Keys = Config.storage.keys;
  const quarantineKey = (Bank.storageNamespace || 'ksBoards') + 'QuarantinedCrossBankRecordsV1';
  let normalizing = false;

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function installStorageFirewall() {
    if (window.__boardsStorageFirewallInstalled) return;
    const prototype = Storage.prototype;
    const nativeSetItem = prototype.setItem;
    const nativeRemoveItem = prototype.removeItem;
    const nativeClear = prototype.clear;
    const selectionKey = Banks.selectionKey;

    function isLocalStorage(target) {
      try { return target === window.localStorage; } catch (_error) { return false; }
    }

    function isOtherBankKey(keyValue) {
      const key = String(keyValue || '');
      if (!key || key === selectionKey) return false;
      if (Bank.legacyStorage) return key.indexOf('abpnBank:') === 0;
      if (key.indexOf(Bank.storageNamespace) === 0) return false;
      return key === 'kaplanBoardPrepState' || key.indexOf('ksBoards') === 0 || key.indexOf('abpnBank:') === 0;
    }

    prototype.setItem = function (key, value) {
      if (isLocalStorage(this) && isOtherBankKey(key)) {
        throw new Error('Cross-bank storage write blocked for key ' + key + ' while ' + Bank.title + ' is active.');
      }
      return nativeSetItem.call(this, key, value);
    };

    prototype.removeItem = function (key) {
      if (isLocalStorage(this) && isOtherBankKey(key)) {
        console.warn('Cross-bank storage deletion ignored.', { key: key, activeBankId: Bank.id });
        return;
      }
      return nativeRemoveItem.call(this, key);
    };

    prototype.clear = function () {
      if (isLocalStorage(this)) throw new Error('Blanket localStorage.clear() is prohibited because question-bank data must remain isolated.');
      return nativeClear.call(this);
    };

    window.__boardsStorageFirewallInstalled = true;
  }

  function bankIdFor(record) {
    const explicit = String(record && record.bankId || '').trim().toLowerCase();
    if (explicit) return explicit;
    return Bank.legacyStorage ? Bank.id : '';
  }

  function quarantine(type, records) {
    if (!records || !records.length) return;
    const existing = Store.read(quarantineKey, []);
    const list = Array.isArray(existing) ? existing : [];
    list.unshift({
      id: 'quarantine-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      createdAt: Date.now(),
      activeBankId: Bank.id,
      activeBankTitle: Bank.title,
      type: type,
      records: clone(records)
    });
    localStorage.setItem(quarantineKey, JSON.stringify(list.slice(0, 10)));
    console.error('Cross-bank records were quarantined instead of being displayed or overwritten.', { type: type, count: records.length, bankId: Bank.id });
  }

  function stamp(record) {
    if (!record || typeof record !== 'object') return record;
    record.bankId = Bank.id;
    record.bankTitle = record.bankTitle || Bank.title;
    record.bankQuestionHash = record.bankQuestionHash || Bank.questionHash;
    return record;
  }

  function normalizeConfig() {
    const config = Store.read(Keys.config, null);
    if (!config || typeof config !== 'object') return false;
    const recordBankId = bankIdFor(config);
    if (!recordBankId || recordBankId !== Bank.id) {
      quarantine('active-config', [config]);
      Store.remove(Keys.config, { reason: 'Cross-bank active set quarantined' });
      return true;
    }
    const before = JSON.stringify(config);
    stamp(config);
    if (JSON.stringify(config) !== before) {
      Store.write(Keys.config, config, { reason: 'Active-set bank identity normalized' });
      return true;
    }
    return false;
  }

  function normalizeSettings() {
    const settings = Store.read(Keys.settings, null);
    if (!settings || typeof settings !== 'object') return false;
    const before = JSON.stringify(settings);
    stamp(settings);
    if (JSON.stringify(settings) !== before) {
      Store.write(Keys.settings, settings, { reason: 'Practice-builder bank identity normalized' });
      return true;
    }
    return false;
  }

  function normalizeHistory() {
    const history = Store.read(Keys.history, {});
    if (!history || typeof history !== 'object' || Array.isArray(history)) return false;
    const output = {};
    const rejected = [];
    let changed = false;
    Object.keys(history).forEach(function (questionId) {
      const item = history[questionId];
      if (!item || typeof item !== 'object') { changed = true; return; }
      const recordBankId = bankIdFor(item);
      if (!recordBankId || recordBankId !== Bank.id || !C.byId.has(questionId)) {
        rejected.push({ questionId: questionId, value: item });
        changed = true;
        return;
      }
      const copy = Object.assign({}, item);
      stamp(copy);
      if (JSON.stringify(copy) !== JSON.stringify(item)) changed = true;
      output[questionId] = copy;
    });
    if (rejected.length) quarantine('question-history', rejected);
    if (changed) Store.write(Keys.history, output, { reason: 'Question history bank identity normalized' });
    return changed;
  }

  function normalizeTests() {
    const tests = Store.read(Keys.tests, []);
    if (!Array.isArray(tests)) {
      Store.write(Keys.tests, [], { reason: 'Invalid completed-test history repaired' });
      return true;
    }
    const output = [];
    const rejected = [];
    let changed = false;
    tests.forEach(function (test) {
      if (!test || typeof test !== 'object' || !test.setId) { changed = true; return; }
      const recordBankId = bankIdFor(test);
      if (!recordBankId || recordBankId !== Bank.id) {
        rejected.push(test);
        changed = true;
        return;
      }
      const copy = Object.assign({}, test);
      stamp(copy);
      copy.ids = Array.isArray(copy.ids) ? copy.ids.filter(function (id) { return C.byId.has(id); }) : [];
      const filteredResults = {};
      Object.keys(copy.results || {}).forEach(function (id) {
        if (!C.byId.has(id)) { changed = true; return; }
        filteredResults[id] = Object.assign({ bankId: Bank.id }, copy.results[id] || {});
      });
      copy.results = filteredResults;
      if (JSON.stringify(copy) !== JSON.stringify(test)) changed = true;
      output.push(copy);
    });
    if (rejected.length) quarantine('completed-tests', rejected);
    if (changed) Store.write(Keys.tests, output.slice(0, Config.limits.savedTests), { reason: 'Completed-test bank identity normalized' });
    return changed;
  }

  function normalizeBackups() {
    const backups = Store.read(Keys.localBackups, []);
    if (!Array.isArray(backups)) return false;
    let changed = false;
    const output = backups.map(function (backup) {
      if (!backup || typeof backup !== 'object') return backup;
      const copy = Object.assign({}, backup);
      copy.bankId = copy.bankId || Bank.id;
      copy.bankTitle = copy.bankTitle || Bank.title;
      copy.metadata = Object.assign({ bankId: Bank.id, bankTitle: Bank.title }, copy.metadata || {});
      if (copy.state && typeof copy.state === 'object') {
        copy.state.bankId = copy.state.bankId || Bank.id;
        copy.state.bankTitle = copy.state.bankTitle || Bank.title;
        copy.state.bankQuestionHash = copy.state.bankQuestionHash || Bank.questionHash;
      }
      if (JSON.stringify(copy) !== JSON.stringify(backup)) changed = true;
      return copy;
    });
    if (changed) Store.write(Keys.localBackups, output, { reason: 'Recovery-backup bank identity normalized' });
    return changed;
  }

  function normalizeAll() {
    if (normalizing) return;
    normalizing = true;
    try {
      normalizeConfig();
      normalizeSettings();
      normalizeHistory();
      normalizeTests();
      normalizeBackups();
    } finally {
      normalizing = false;
    }
  }

  function addPackageIdentity(payload) {
    const value = Object.assign({}, payload || {});
    value.bankId = Bank.id;
    value.bankTitle = Bank.title;
    value.bankShortTitle = Bank.shortTitle;
    value.bankQuestionHash = Bank.questionHash;
    value.datasetId = Config.questionVault.datasetId;
    return value;
  }

  const Model = Object.freeze({
    stableStringify: BaseModel.stableStringify,
    hashValue: BaseModel.hashValue,
    cloneQuestion: BaseModel.cloneQuestion,
    buildMasterPackage: function () {
      const payload = addPackageIdentity(BaseModel.buildMasterPackage());
      payload.source = Object.assign({}, payload.source || {}, {
        repository: Config.questionVault.repository,
        branch: 'main',
        file: Bank.sourceFile,
        label: Bank.source,
        build: Config.build,
        stagingBranch: Config.questionVault.stagingBranch
      });
      return payload;
    },
    buildPerformancePackage: function (master, previous) {
      const payload = addPackageIdentity(BaseModel.buildPerformancePackage(master, previous));
      payload.sourceBuild = Config.build;
      return payload;
    },
    buildCorrelatedPackage: function (master, performance) {
      return addPackageIdentity(BaseModel.buildCorrelatedPackage(master, performance));
    },
    validatePackage: function (packageValue) {
      const result = BaseModel.validatePackage(packageValue);
      const packageBankId = String(packageValue && packageValue.bankId || '').trim().toLowerCase();
      if (packageBankId && packageBankId !== Bank.id) result.errors.push('Package belongs to question bank ' + packageBankId + ', not ' + Bank.id + '.');
      if (!packageBankId && !Bank.legacyStorage) result.errors.push('Package is missing the required bankId for ' + Bank.title + '.');
      result.valid = result.errors.length === 0;
      result.bankId = packageBankId || (Bank.legacyStorage ? Bank.id : '');
      return result;
    },
    diffPackages: function (previous, next) {
      const beforeId = String(previous && previous.bankId || '').trim().toLowerCase();
      const afterId = String(next && next.bankId || '').trim().toLowerCase();
      if (beforeId && beforeId !== Bank.id) throw new Error('The existing package belongs to another question bank.');
      if (afterId && afterId !== Bank.id) throw new Error('The proposed package belongs to another question bank.');
      return BaseModel.diffPackages(previous, next);
    }
  });
  window.BoardsQuestionBankModel = Model;

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element && element.textContent !== value) element.textContent = value;
  }

  function decorateUi() {
    setText('#analyticsSection .dashboard-card:nth-child(2) h3', 'Previous tests — ' + Bank.shortTitle);
    setText('#progressManagementSection .dashboard-card:first-child h3', 'Reset ' + Bank.shortTitle + ' questions safely');
    setText('#progressManagementSection .dashboard-card:nth-child(2) h3', Bank.shortTitle + ' recovery backups');
    setText('#driveBackupSection .dashboard-card:first-child h3', 'Private cloud backup — ' + Bank.shortTitle);
    setText('#driveBackupSection .dashboard-card:nth-child(2) h3', Bank.shortTitle + ' Drive history');
    setText('#questionVaultSection .dashboard-card:first-child h3', 'Visible Drive archive — ' + Bank.shortTitle);
    setText('#questionVaultSection .dashboard-card:nth-child(2) h3', Bank.shortTitle + ' draft workspace');
    setText('#hardResetCard h3', 'Absolute reset — ' + Bank.shortTitle);
    setText('#hardResetTitle', 'Start ' + Bank.shortTitle + ' completely fresh?');
    const resetParagraph = document.querySelector('#hardResetModal .hard-reset-dialog > p');
    if (resetParagraph) resetParagraph.textContent = 'This resets only ' + Bank.title + ' active study data in this browser, its hidden Drive backup, and its visible Question Vault performance files. Other question banks, historical cloud archives, and the original GitHub question source remain protected.';
  }

  function validateCurrentState() {
    const failures = [];
    const config = Store.read(Keys.config, null);
    if (config && bankIdFor(config) !== Bank.id) failures.push('Active set belongs to another bank.');
    const tests = Store.read(Keys.tests, []);
    if (Array.isArray(tests)) tests.forEach(function (test) { if (bankIdFor(test) !== Bank.id) failures.push('Completed test ' + (test && test.setId || 'unknown') + ' belongs to another bank.'); });
    const history = Store.read(Keys.history, {});
    Object.keys(history || {}).forEach(function (id) { if (bankIdFor(history[id]) !== Bank.id) failures.push('Question history ' + id + ' belongs to another bank.'); });
    return {
      valid: failures.length === 0,
      bankId: Bank.id,
      bankTitle: Bank.title,
      questionCount: C.fullBank.length,
      completedTests: Array.isArray(tests) ? tests.length : 0,
      failures: failures
    };
  }

  installStorageFirewall();
  normalizeAll();
  Store.subscribe(function (change) {
    if (normalizing) return;
    if ([Keys.config, Keys.settings, Keys.history, Keys.tests, Keys.localBackups].indexOf(change.key) >= 0) normalizeAll();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateUi);
  else decorateUi();
  new MutationObserver(function () { decorateUi(); }).observe(document.documentElement, { childList: true, subtree: true });

  window.BoardsBankConsistency = Object.freeze({
    normalizeAll: normalizeAll,
    validateCurrentState: validateCurrentState,
    quarantineKey: quarantineKey,
    activeBank: Bank
  });
})();