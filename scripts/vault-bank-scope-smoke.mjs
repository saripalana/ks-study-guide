import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'boards-vault-bank-scope.js'), 'utf8');
const failures = [];
const assert = (value, message) => { if (!value) failures.push(message); };

async function runCase({ legacy, bankId, title }) {
  const calls = [];
  const writes = [];
  let readPayload = null;
  const rawClient = {
    initialize() { return true; },
    connect() {},
    disconnect() {},
    revoke() {},
    isConnected() { return true; },
    async ensureFolder(name, parentId, role) {
      calls.push({ name, parentId: parentId || null, role });
      return { id: `${role}:${name}`, name, webViewLink: `https://drive.test/${role}/${name}` };
    },
    async readNamed(name, folder) { return { file: { id: `file:${name}` }, payload: readPayload }; },
    async upsertJson(name, folder, payload, role) { writes.push({ kind: 'upsert', name, folder, payload, role }); return { id: `upsert:${name}` }; },
    async appendJson(name, folder, payload, role) { writes.push({ kind: 'append', name, folder, payload, role }); return { id: `append:${name}` }; }
  };
  const context = {
    console,
    Object,
    window: {
      BoardsConfig: {
        projectId: 'psychiatry-board-practice',
        bank: { id: bankId, title, shortTitle: title, questionHash: `${bankId}-hash`, legacyStorage: legacy },
        questionVault: {
          datasetId: `dataset-${bankId}`,
          bankId,
          bankTitle: title,
          bankFolder: bankId,
          banksFolder: 'Banks',
          legacyLayout: legacy,
          rootFolder: 'Psychiatry Board Question Vault'
        }
      },
      BoardsVisibleDriveClient: { create() { return rawClient; } }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'boards-vault-bank-scope.js' });
  const client = context.window.BoardsVisibleDriveClient.create({});
  const rootFolder = await client.ensureFolder('Psychiatry Board Question Vault', null, 'root');
  const production = await client.ensureFolder('Production', rootFolder.id, 'production');
  await client.upsertJson('manifest.json', production, { value: 1 }, 'manifest');
  await client.appendJson('history.json', production, { value: 2 }, 'history');

  readPayload = legacy ? { value: 3 } : { bankId, value: 3 };
  await client.readNamed('owned.json', production);
  readPayload = { bankId: 'wrong-bank', value: 4 };
  let wrongBankRejected = false;
  try { await client.readNamed('wrong.json', production); }
  catch (error) { wrongBankRejected = /belongs to another question bank/i.test(error.message); }

  return { calls, writes, rootFolder, production, wrongBankRejected, path: context.window.BoardsVaultBankScope.path() };
}

const ks = await runCase({ legacy: true, bankId: 'ks-psychiatry-core', title: 'K&S Psychiatry Question Bank' });
assert(ks.calls.length >= 2, 'K&S folder calls were not recorded.');
assert(ks.calls[0].name === 'Psychiatry Board Question Vault' && ks.calls[0].role === 'root', 'K&S did not use the existing root vault.');
assert(!ks.calls.some((call) => call.name === 'Banks'), 'K&S must not be moved into a new Banks folder.');
assert(ks.calls[1].name === 'Production' && ks.calls[1].parentId === ks.rootFolder.id, 'K&S Production did not remain under the existing root.');
assert(ks.path === 'Psychiatry Board Question Vault', 'K&S visible-vault path changed.');
assert(ks.writes.every((write) => write.payload.bankId === 'ks-psychiatry-core'), 'K&S visible-vault payloads were not stamped with bank identity.');
assert(ks.wrongBankRejected, 'K&S adapter did not reject an explicitly wrong-bank payload.');

const future = await runCase({ legacy: false, bankId: 'future-psychiatry-bank', title: 'Future Psychiatry Bank' });
assert(future.calls[0].name === 'Psychiatry Board Question Vault' && future.calls[0].role === 'root', 'Future bank did not locate the global vault root.');
const banksCall = future.calls.find((call) => call.name === 'Banks');
const bankCall = future.calls.find((call) => call.name === 'future-psychiatry-bank');
assert(banksCall && banksCall.parentId === future.calls[0].role + ':' + future.calls[0].name, 'Future bank did not create/use the Banks folder under the global root.');
assert(bankCall && bankCall.parentId === 'banks-root:Banks', 'Future bank did not create/use its own bank folder.');
assert(future.calls.some((call) => call.name === 'Production' && call.parentId === 'bank-root:future-psychiatry-bank'), 'Future Production was not isolated under its bank folder.');
assert(future.path === 'Psychiatry Board Question Vault / Banks / future-psychiatry-bank', 'Future visible-vault path is incorrect.');
assert(future.writes.every((write) => write.payload.bankId === 'future-psychiatry-bank' && write.payload.bankQuestionHash === 'future-psychiatry-bank-hash'), 'Future visible-vault payload ownership metadata is incomplete.');
assert(future.wrongBankRejected, 'Future adapter did not reject a wrong-bank payload.');

if (failures.length) {
  console.error(`Visible Question Vault bank-scope test failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('K&S legacy vault layout and future-bank folder/payload isolation passed.');