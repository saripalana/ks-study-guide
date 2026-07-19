(function () {
  'use strict';

  const Config = window.BoardsConfig;
  const OriginalFactory = window.BoardsVisibleDriveClient;
  if (!Config || !OriginalFactory || !Config.questionVault) throw new Error('Question Vault bank-scope dependencies are unavailable.');

  const Vault = Config.questionVault;

  function identity(payload) {
    return Object.assign({}, payload || {}, {
      bankId: Config.bank.id,
      bankTitle: Config.bank.title,
      bankShortTitle: Config.bank.shortTitle,
      bankQuestionHash: Config.bank.questionHash,
      datasetId: Vault.datasetId
    });
  }

  function validatePayload(payload, label) {
    if (!payload || typeof payload !== 'object') return payload;
    const explicit = String(payload.bankId || '').trim().toLowerCase();
    if (explicit && explicit !== Config.bank.id) {
      throw new Error((label || 'Question Vault file') + ' belongs to another question bank: ' + explicit + '.');
    }
    if (!explicit && !Config.bank.legacyStorage) {
      throw new Error((label || 'Question Vault file') + ' is missing the required bank identity for ' + Config.bank.title + '.');
    }
    return payload;
  }

  function scopedPath() {
    return Vault.legacyLayout
      ? Vault.rootFolder
      : Vault.rootFolder + ' / ' + Vault.banksFolder + ' / ' + Vault.bankFolder;
  }

  function create(options) {
    const client = OriginalFactory.create(options);
    let globalRoot = null;
    let scopedRoot = null;

    async function ensureFolder(name, parentId, role) {
      if (role !== 'root') return client.ensureFolder(name, parentId, role);
      if (scopedRoot) return scopedRoot;
      globalRoot = await client.ensureFolder(name, parentId, 'root');
      if (Vault.legacyLayout) {
        scopedRoot = globalRoot;
        return scopedRoot;
      }
      const banksRoot = await client.ensureFolder(Vault.banksFolder, globalRoot.id, 'banks-root');
      scopedRoot = await client.ensureFolder(Vault.bankFolder, banksRoot.id, 'bank-root');
      return scopedRoot;
    }

    async function readNamed(name, folder) {
      const result = await client.readNamed(name, folder);
      validatePayload(result && result.payload, name);
      return result;
    }

    async function upsertJson(name, folder, payload, role) {
      return client.upsertJson(name, folder, identity(payload), role);
    }

    async function appendJson(name, folder, payload, role) {
      return client.appendJson(name, folder, identity(payload), role);
    }

    return Object.freeze({
      initialize: client.initialize,
      connect: client.connect,
      disconnect: client.disconnect,
      revoke: client.revoke,
      isConnected: client.isConnected,
      ensureFolder: ensureFolder,
      readNamed: readNamed,
      upsertJson: upsertJson,
      appendJson: appendJson,
      getGlobalRoot: function () { return globalRoot; },
      getScopedRoot: function () { return scopedRoot; },
      getScopedPath: scopedPath
    });
  }

  window.BoardsVisibleDriveClient = Object.freeze({ create: create });
  window.BoardsVaultBankScope = Object.freeze({
    identity: identity,
    validatePayload: validatePayload,
    path: scopedPath
  });
})();