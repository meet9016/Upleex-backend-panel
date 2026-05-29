/**
 * Convert keyword research CSV to category-seo-metadata.json
 *
 * Usage:
 *   node scripts/csv-to-metadata-json.mjs
 *   node scripts/csv-to-metadata-json.mjs "C:/path/to/file.csv"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  csvTextToMetadataJson,
  saveMetadataJson,
  METADATA_JSON_PATH,
} = require('../src/utils/metadataCsv.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const defaultCsv =
  'C:/Users/LENOVO/Downloads/Upleex Website Keyword Research - On Page and Keywords Research.csv';
const csvPath = process.argv[2] || defaultCsv;

if (!fs.existsSync(csvPath)) {
  console.error(`CSV not found: ${csvPath}`);
  process.exit(1);
}

const csvText = fs.readFileSync(csvPath, 'utf8');
const json = csvTextToMetadataJson(csvText, path.basename(csvPath));
const outPath = saveMetadataJson(json);

console.log(`Converted ${json.total_entries} entries`);
console.log(`Categories: ${Object.keys(json.byCategory).length}`);
console.log(`Sub-categories: ${Object.keys(json.bySubCategory).length}`);
console.log(`JSON saved: ${outPath}`);
