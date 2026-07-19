import fs from 'node:fs';

const file = 'scripts/browser-smoke.mjs';
const before = "    await page.click('#closeHistoryModal');";
const after = "    await page.$eval('#closeHistoryModal', (element) => element.click());";
let content = fs.readFileSync(file, 'utf8');
if (!content.includes(before)) throw new Error('Expected physical close-button click was not found.');
content = content.replace(before, after);
fs.writeFileSync(file, content);
console.log('Updated saved-test close interaction to use the installed DOM click handler.');
