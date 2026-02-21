const fs = require('fs');
const path = require('path');

const TOPICS_DIR = path.join(__dirname, '../src/assets/topics');
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function readTopicRows() {
  if (!fs.existsSync(TOPICS_DIR)) {
    throw new Error(`Topics directory not found: ${TOPICS_DIR}`);
  }

  const files = fs
    .readdirSync(TOPICS_DIR)
    .filter((file) => file.endsWith('.json') && file !== 'index.json');

  const rows = [];
  for (const file of files) {
    const id = path.basename(file, '.json');
    const fullPath = path.join(TOPICS_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf-8');
    const topic = JSON.parse(raw);

    const verseIds = Array.isArray(topic.verse_ids) ? topic.verse_ids : [];
    rows.push({
      topic_id: id,
      titles: topic.titles || { hu: id, en: id },
      description: topic.description || { hu: '', en: '' },
      icon: topic.icon || 'star',
      category: topic.category || 'general',
      theme_color: topic.theme_color || '#3b82f6',
      verse_ids: verseIds,
      verse_count: verseIds.length,
      source_hash: `${id}:${verseIds.length}`,
      updated_at: new Date().toISOString(),
    });
  }

  return rows;
}

async function upsertTopics(rows) {
  const endpoint = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/default_topics?on_conflict=topic_id`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Supabase upsert failed (${response.status}): ${txt}`);
  }
}

(async function main() {
  try {
    const rows = readTopicRows();

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('[sync-topics] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing, skipping DB sync.');
      console.log(`[sync-topics] Local topics parsed: ${rows.length}`);
      process.exit(0);
    }

    await upsertTopics(rows);
    console.log(`[sync-topics] Synced ${rows.length} topics to Supabase default_topics.`);
  } catch (err) {
    console.error('[sync-topics] Failed:', err.message || err);
    process.exit(1);
  }
})();
