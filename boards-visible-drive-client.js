(function () {
  'use strict';

  const Config = window.BoardsConfig;
  if (!Config) throw new Error('Visible Drive client configuration is unavailable.');

  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const JSON_MIME = 'application/json';

  function sleep(milliseconds) {
    return new Promise(function (resolve) { setTimeout(resolve, milliseconds); });
  }

  function escapeQuery(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function create(options) {
    const settings = Object.assign({
      clientId: Config.drive.clientId,
      scope: '',
      retryLimit: Config.drive.retryLimit,
      onAuthorized: function () {},
      onDisconnected: function () {},
      onError: function () {}
    }, options || {});

    let tokenClient = null;
    let accessToken = '';
    let tokenExpiresAt = 0;
    let connected = false;
    const knownFiles = {};

    function tokenValid() {
      return !!accessToken && Date.now() < tokenExpiresAt - 30000;
    }

    function initialize() {
      if (tokenClient) return true;
      if (!window.google || !google.accounts || !google.accounts.oauth2) return false;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: settings.clientId,
        scope: settings.scope,
        include_granted_scopes: true,
        callback: function (response) {
          if (!response || response.error || !response.access_token) {
            settings.onError(new Error('Google authorization was not completed.'));
            return;
          }
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, settings.scope)) {
            settings.onError(new Error('The requested Google Drive permission was not granted.'));
            return;
          }
          accessToken = response.access_token;
          tokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
          connected = true;
          settings.onAuthorized();
        },
        error_callback: function () {
          settings.onError(new Error('The Google authorization window was closed or blocked.'));
        }
      });
      return true;
    }

    function connect() {
      if (!initialize()) throw new Error('Google authorization is still loading. Try again in a moment.');
      tokenClient.requestAccessToken({ prompt: '' });
    }

    function disconnect() {
      accessToken = '';
      tokenExpiresAt = 0;
      connected = false;
      Object.keys(knownFiles).forEach(function (key) { delete knownFiles[key]; });
      settings.onDisconnected();
    }

    function revoke(callback) {
      if (!accessToken || !window.google || !google.accounts || !google.accounts.oauth2) return;
      const token = accessToken;
      google.accounts.oauth2.revoke(token, function () {
        disconnect();
        if (callback) callback();
      });
    }

    async function request(url, optionsValue) {
      if (!tokenValid()) {
        disconnect();
        throw new Error('Google Drive authorization expired. Connect again.');
      }
      let lastError = null;
      for (let attempt = 0; attempt < settings.retryLimit; attempt += 1) {
        try {
          const options = Object.assign({}, optionsValue || {});
          const headers = new Headers(options.headers || {});
          headers.set('Authorization', 'Bearer ' + accessToken);
          options.headers = headers;
          const response = await fetch(url, options);
          if (response.status === 401) {
            disconnect();
            throw new Error('Google Drive authorization expired. Connect again.');
          }
          if (response.ok) return response;
          const body = await response.text();
          if ([429, 500, 502, 503, 504].indexOf(response.status) >= 0 && attempt < settings.retryLimit - 1) {
            lastError = new Error('Temporary Drive error (' + response.status + ').');
            await sleep(Math.pow(2, attempt) * 500);
            continue;
          }
          throw new Error('Google Drive request failed (' + response.status + '). ' + body.slice(0, 180));
        } catch (error) {
          lastError = error;
          if (attempt >= settings.retryLimit - 1 || /authorization expired/i.test(error.message)) throw error;
          await sleep(Math.pow(2, attempt) * 500);
        }
      }
      throw lastError || new Error('Google Drive request failed.');
    }

    async function findFile(name, parentId, mimeType) {
      const terms = ["name='" + escapeQuery(name) + "'", 'trashed=false'];
      if (parentId) terms.push("'" + escapeQuery(parentId) + "' in parents");
      if (mimeType) terms.push("mimeType='" + escapeQuery(mimeType) + "'");
      const url = 'https://www.googleapis.com/drive/v3/files?pageSize=20&orderBy=modifiedTime%20desc&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,parents,appProperties)&q=' + encodeURIComponent(terms.join(' and '));
      const response = await request(url);
      const data = await response.json();
      return data.files && data.files.length ? data.files[0] : null;
    }

    async function createMetadata(metadata) {
      const response = await request('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,size,webViewLink,parents,appProperties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata)
      });
      return response.json();
    }

    async function ensureFolder(name, parentId, role) {
      let folder = await findFile(name, parentId, FOLDER_MIME);
      if (folder) return folder;
      folder = await createMetadata({
        name: name,
        mimeType: FOLDER_MIME,
        parents: parentId ? [parentId] : undefined,
        appProperties: { projectId: Config.projectId, vaultRole: role }
      });
      return folder;
    }

    async function readJson(file) {
      if (!file) return null;
      const response = await request('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.id) + '?alt=media');
      return response.json();
    }

    async function createJson(name, parentId, payload, role) {
      const boundary = 'question_vault_' + Math.random().toString(36).slice(2);
      const metadata = {
        name: name,
        mimeType: JSON_MIME,
        parents: [parentId],
        appProperties: { projectId: Config.projectId, vaultRole: role, schemaVersion: String(Config.questionVault.schemaVersion) }
      };
      const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) + '\r\n--' + boundary + '\r\nContent-Type: application/json\r\n\r\n' +
        JSON.stringify(payload, null, 2) + '\r\n--' + boundary + '--';
      const response = await request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,size,webViewLink,parents,appProperties', {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
        body: body
      });
      return response.json();
    }

    async function updateJson(file, payload) {
      const response = await request('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(file.id) + '?uploadType=media&fields=id,name,mimeType,modifiedTime,size,webViewLink,parents,appProperties', {
        method: 'PATCH',
        headers: { 'Content-Type': JSON_MIME },
        body: JSON.stringify(payload, null, 2)
      });
      return response.json();
    }

    async function readNamed(name, folder) {
      const key = folder.id + '|' + name;
      const file = knownFiles[key] || await findFile(name, folder.id, JSON_MIME);
      if (!file) return { file: null, payload: null };
      knownFiles[key] = file;
      return { file: file, payload: await readJson(file) };
    }

    async function upsertJson(name, folder, payload, role) {
      const key = folder.id + '|' + name;
      const existing = knownFiles[key] || await findFile(name, folder.id, JSON_MIME);
      const file = existing ? await updateJson(existing, payload) : await createJson(name, folder.id, payload, role);
      knownFiles[key] = file;
      return file;
    }

    async function appendJson(name, folder, payload, role) {
      return createJson(name, folder.id, payload, role);
    }

    return Object.freeze({
      initialize: initialize,
      connect: connect,
      disconnect: disconnect,
      revoke: revoke,
      isConnected: function () { return connected && tokenValid(); },
      ensureFolder: ensureFolder,
      readNamed: readNamed,
      upsertJson: upsertJson,
      appendJson: appendJson
    });
  }

  window.BoardsVisibleDriveClient = Object.freeze({ create: create });
})();