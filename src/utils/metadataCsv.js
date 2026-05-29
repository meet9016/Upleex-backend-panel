const fs = require('fs');
const path = require('path');

const METADATA_JSON_PATH = path.join(__dirname, '../../data/category-seo-metadata.json');

const normalizeSeoLookupKey = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || (c === '\r' && next === '\n')) {
      row.push(cell);
      cell = '';
      if (row.some((v) => String(v || '').trim())) rows.push(row);
      row = [];
      if (c === '\r') i += 1;
    } else {
      cell += c;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some((v) => String(v || '').trim())) rows.push(row);
  }

  return rows;
};

const toFaqList = (raw) =>
  String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((question) => ({ question, answer: '' }));

const parseH2List = (raw) =>
  String(raw || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const buildSeoContentFromRow = (row, parentCategory) => {
  const h2List = parseH2List(row.H2);
  const metaDesc = String(row['Meta Description'] || '').trim();

  const sections = h2List.map((heading) => ({
    heading,
    heading_level: 'h2',
    bullets: [],
  }));

  const entitiesRaw = String(row.Entities || '').trim();
  const entities = entitiesRaw
    .split('\n')
    .map((e) => e.trim())
    .filter(Boolean);

  if (entities.length) {
    sections.push({
      heading: 'Related Keywords & Topics',
      heading_level: 'h3',
      bullets: entities.map((text) => ({ label: '', text, plain: true })),
    });
  }

  const anchorTags = String(row['Anchor Tag Ideas'] || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    category: parentCategory,
    sub_category: String(row['Sub Category'] || '').trim(),
    meta_title: String(row['Meta Title'] || '').trim(),
    meta_description: metaDesc,
    core_keyword: String(row['Core Keyword'] || '').trim(),
    secondary_keywords: String(row['Secondary Keywords'] || '').trim(),
    search_intent: String(row['Search Intent'] || '').trim(),
    content_intent: String(row['Content Intent'] || '').trim(),
    hero_title: String(row.H1 || '').trim(),
    hero_text: metaDesc,
    intro_heading: h2List[0] || '',
    intro_paragraphs: metaDesc ? [metaDesc] : [],
    sections,
    main_text: anchorTags[0] || '',
    sub_text: '',
    image_alt: String(row['Image Alt Tag'] || '').trim(),
    image_title: String(row['Image Title'] || '').trim(),
    faqs: toFaqList(row.FAQ),
    anchor_tags: anchorTags,
    entities,
  };
};

const csvTextToRecords = (csvText) => {
  const table = parseCsv(csvText);
  if (table.length < 2) return [];

  const headers = table[0].map((h) => String(h || '').trim());
  return table.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] || '';
    });
    return row;
  });
};

const recordsToMetadataJson = (records, source = 'upload') => {
  const byCategory = {};
  const bySubCategory = {};
  const byNormalizedName = {};
  const entries = [];

  let currentParent = '';

  for (const row of records) {
    const cat = String(row.Category || '').trim();
    if (cat) currentParent = cat;

    const metaTitle = String(row['Meta Title'] || '').trim();
    if (!metaTitle && !String(row.H1 || '').trim()) continue;

    const entry = buildSeoContentFromRow(row, currentParent);
    entries.push(entry);

    const sub = entry.sub_category;
    const catKey = normalizeSeoLookupKey(currentParent);
    const subKey = normalizeSeoLookupKey(sub || entry.hero_title || metaTitle);

    if (sub) {
      bySubCategory[sub] = entry;
      byNormalizedName[subKey] = entry;
    } else if (currentParent && !byCategory[currentParent]) {
      byCategory[currentParent] = entry;
      byNormalizedName[catKey] = entry;
    }

    if (currentParent) {
      byNormalizedName[`${catKey}::${subKey}`] = entry;
    }
  }

  return {
    generated_at: new Date().toISOString(),
    source,
    total_entries: entries.length,
    byCategory,
    bySubCategory,
    byNormalizedName,
    entries,
  };
};

const csvTextToMetadataJson = (csvText, source = 'upload') => {
  const records = csvTextToRecords(csvText);
  return recordsToMetadataJson(records, source);
};

const saveMetadataJson = (json) => {
  const dir = path.dirname(METADATA_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(METADATA_JSON_PATH, JSON.stringify(json, null, 2), 'utf8');
  return METADATA_JSON_PATH;
};

const readMetadataJson = () => {
  if (!fs.existsSync(METADATA_JSON_PATH)) return null;
  const raw = fs.readFileSync(METADATA_JSON_PATH, 'utf8');
  return JSON.parse(raw);
};

const toSeoContent = (entry) => ({
  meta_title: entry.meta_title || '',
  meta_description: entry.meta_description || '',
  core_keyword: entry.core_keyword || '',
  secondary_keywords: entry.secondary_keywords || '',
  image_alt: entry.image_alt || '',
  image_title: entry.image_title || '',
  anchor_tags: entry.anchor_tags || [],
  faqs: entry.faqs || [],
  hero_title: entry.hero_title || '',
  hero_text: entry.hero_text || '',
  intro_heading: entry.intro_heading || '',
  intro_paragraphs: entry.intro_paragraphs || [],
  sections: entry.sections || [],
  main_text: entry.main_text || '',
  sub_text: entry.sub_text || '',
});

module.exports = {
  METADATA_JSON_PATH,
  normalizeSeoLookupKey,
  parseCsv,
  csvTextToRecords,
  csvTextToMetadataJson,
  recordsToMetadataJson,
  saveMetadataJson,
  readMetadataJson,
  toSeoContent,
  buildSeoContentFromRow,
};
