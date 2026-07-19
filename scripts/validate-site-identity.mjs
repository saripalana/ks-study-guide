import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];

const html = read('boards.html');
const identity = read('boards-site-identity.js');
const config = read('boards-config.js');

for (const text of ['ABPN PSYCHIATRY STUDY SITE', 'ABPN Psychiatry Study', './boards-site-identity.js']) {
  if (!html.includes(text)) failures.push(`ABPN site shell is missing: ${text}`);
}
for (const text of ["SITE_NAME = 'ABPN Psychiatry Study'", "SITE_EYEBROW = 'ABPN PSYCHIATRY STUDY SITE'", 'registry.activeBank()', 'document.title = bank ? SITE_NAME']) {
  if (!identity.includes(text)) failures.push(`Site identity module is missing: ${text}`);
}

const headerBlock = html.match(/<header class="dashboard-topbar">([\s\S]*?)<\/header>/)?.[1] || '';
if (/K&amp;S|K&S|Kaplan|Sadock/i.test(headerBlock)) failures.push('The global site header must not use K&S or Kaplan & Sadock branding.');
if (!config.includes("title: 'K&S Psychiatry Question Bank'")) failures.push('K&S must remain available as the specific question-bank title.');
if (!config.includes("shortTitle: 'K&S Psychiatry'")) failures.push('K&S question-bank short title is missing.');
if (!config.includes("description: 'The original K&S psychiatry study question bank.'")) failures.push('K&S identity must remain attached to its bank description.');

if (failures.length) {
  console.error(`Site identity validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('ABPN site identity is separate from K&S and future question-bank identities.');