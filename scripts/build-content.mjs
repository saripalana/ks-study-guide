import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bankId = 'ks-psychiatry-core';
const bankRoot = path.join(root, 'content', 'banks', bankId);
const outputPath = path.join(root, 'generated', `${bankId}-content.js`);
const checkOnly = process.argv.includes('--check');

function readJsonFiles(folderName) {
  const directory = path.join(bankRoot, folderName);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('_'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const fullPath = path.join(directory, entry.name);
      let value;
      try {
        value = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (error) {
        throw new Error(`${path.relative(root, fullPath)} is invalid JSON: ${error.message}`);
      }
      return { file: path.relative(root, fullPath), value };
    });
}

function nonemptyString(value, label, file) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${file}: ${label} is required.`);
  return value.trim();
}

function validateCard(entry, collectionId, provenanceClass) {
  const { file, value } = entry;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file}: card must be an object.`);
  if (value.template === true) throw new Error(`${file}: templates must begin with an underscore and are never compiled.`);
  if (value.bankId !== bankId) throw new Error(`${file}: bankId must be ${bankId}.`);
  if (value.collectionId !== collectionId) throw new Error(`${file}: collectionId must be ${collectionId}.`);
  if (!['approved', 'active'].includes(value.status)) throw new Error(`${file}: only approved or active cards may enter the runtime bundle.`);
  const id = nonemptyString(value.id, 'id', file);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id)) throw new Error(`${file}: unsupported id ${id}.`);
  nonemptyString(value.question, 'question', file);
  if (!Array.isArray(value.choices) || value.choices.length < 2) throw new Error(`${file}: at least two choices are required.`);
  if (!Array.isArray(value.choiceLetters) || value.choiceLetters.length !== value.choices.length) throw new Error(`${file}: choices and choiceLetters must have equal lengths.`);
  if (!value.choiceLetters.includes(value.correctLetter)) throw new Error(`${file}: correctLetter must match a choice letter.`);
  if (!value.provenance || value.provenance.class !== provenanceClass) throw new Error(`${file}: provenance.class must be ${provenanceClass}.`);
  if (value.provenance.originalBankMaterial !== false) throw new Error(`${file}: supplemental cards must explicitly declare originalBankMaterial false.`);
  return value;
}

const allowedRevisionFields = new Set([
  'question', 'choices', 'choiceLetters', 'correctLetter', 'answerText', 'explanation',
  'categories', 'tags', 'difficulty', 'learningObjectives', 'references', 'source'
]);

function validateRevision(entry) {
  const { file, value } = entry;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${file}: revision must be an object.`);
  if (value.template === true) throw new Error(`${file}: templates must begin with an underscore and are never compiled.`);
  if (value.bankId !== bankId || value.collectionId !== 'ai-revisions') throw new Error(`${file}: revision bank or collection is incorrect.`);
  if (!['approved', 'active'].includes(value.status)) throw new Error(`${file}: only approved or active revisions may enter the runtime bundle.`);
  nonemptyString(value.revisionId, 'revisionId', file);
  nonemptyString(value.targetQuestionId, 'targetQuestionId', file);
  nonemptyString(value.baseContentHash, 'baseContentHash', file);
  if (!Array.isArray(value.changedFields) || !value.changedFields.length) throw new Error(`${file}: changedFields is required.`);
  if (!value.changes || typeof value.changes !== 'object' || Array.isArray(value.changes)) throw new Error(`${file}: changes must be an object.`);
  const fields = [...new Set(value.changedFields.map(String))].sort();
  for (const field of fields) {
    if (!allowedRevisionFields.has(field)) throw new Error(`${file}: revision cannot change ${field}.`);
    if (!Object.prototype.hasOwnProperty.call(value.changes, field)) throw new Error(`${file}: changedFields names ${field} but changes does not contain it.`);
  }
  for (const field of Object.keys(value.changes)) {
    if (!fields.includes(field)) throw new Error(`${file}: changes contains undeclared field ${field}.`);
  }
  if (Object.prototype.hasOwnProperty.call(value.changes, 'id')) throw new Error(`${file}: stable question IDs cannot be revised.`);
  if (!value.provenance || value.provenance.class !== 'ai-revised-original') throw new Error(`${file}: provenance.class must be ai-revised-original.`);
  if (value.provenance.originalBankMaterialPreserved !== true || value.provenance.overwritesOriginalSource !== false) {
    throw new Error(`${file}: revision must preserve the original source and prohibit overwriting it.`);
  }
  return { ...value, changedFields: fields };
}

const aiCreated = readJsonFiles('ai-created').map((entry) => validateCard(entry, 'ai-created', 'ai-created'));
const userCreated = readJsonFiles('user-created').map((entry) => validateCard(entry, 'user-created', 'user-created'));
const revisions = readJsonFiles('ai-revisions').map(validateRevision);

const ids = new Set();
for (const card of [...aiCreated, ...userCreated]) {
  if (ids.has(card.id)) throw new Error(`Duplicate supplemental card id: ${card.id}`);
  ids.add(card.id);
}
const revisionIds = new Set();
for (const revision of revisions) {
  if (revisionIds.has(revision.revisionId)) throw new Error(`Duplicate revision id: ${revision.revisionId}`);
  revisionIds.add(revision.revisionId);
}

const bundle = {
  schemaVersion: 1,
  bankId,
  sourceRoot: `content/banks/${bankId}`,
  collections: {
    aiCreated,
    userCreated,
    revisions
  },
  counts: {
    aiCreated: aiCreated.length,
    userCreated: userCreated.length,
    revisions: revisions.length
  }
};

const output = `// Generated by scripts/build-content.mjs. Do not edit this file directly.\n` +
  `window.BOARDS_GENERATED_CONTENT = ${JSON.stringify(bundle, null, 2)};\n`;

if (checkOnly) {
  if (!fs.existsSync(outputPath)) throw new Error(`Missing generated bundle: ${path.relative(root, outputPath)}`);
  const current = fs.readFileSync(outputPath, 'utf8');
  if (current !== output) throw new Error('Generated content bundle is stale. Run: node scripts/build-content.mjs');
  console.log(`Content bundle is current: ${aiCreated.length} AI cards, ${userCreated.length} user cards, ${revisions.length} revisions.`);
} else {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  console.log(`Wrote ${path.relative(root, outputPath)}.`);
}
