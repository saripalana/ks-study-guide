import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'ui-smoke-report.json');

try {
  await import('./browser-smoke.mjs');
} catch (error) {
  let report = { generatedAt: new Date().toISOString(), results: [], passed: false, failures: [] };
  if (fs.existsSync(reportPath)) {
    try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); }
    catch (_parseError) { /* use a clean diagnostic report */ }
  }
  report.passed = false;
  report.failures = Array.isArray(report.failures) ? report.failures : [];
  report.failures.push('Browser smoke harness exception: ' + (error && error.stack ? error.stack : String(error)));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.error(error);
  process.exitCode = 1;
}
