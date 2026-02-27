#!/usr/bin/env node
/**
 * build-data.js — plateaus/*.md → src/data/plateaus.ts + src/data/keywords.ts
 *
 * Generates typed data modules from Markdown source files.
 * Also extracts keywords and builds a co-occurrence index for the word field.
 *
 * Usage: node scripts/build-data.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PLATEAUS_DIR = path.join(ROOT, 'plateaus');
const DATA_DIR = path.join(ROOT, 'src', 'data');

// ---- YAML frontmatter parser ----
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('YAML frontmatter not found');
  const yamlStr = match[1];
  const body = match[2].trim();
  const meta = {};
  for (const line of yamlStr.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let value = trimmed.slice(colonIdx + 1).trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      value = inner ? inner.split(',').map(v => { const n = Number(v.trim()); return isNaN(n) ? v.trim() : n; }) : [];
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    } else if (!isNaN(Number(value)) && value !== '') {
      value = Number(value);
    }
    meta[key] = value;
  }
  return { meta, body };
}

// ---- Keyword extraction ----
// Extract 【keyword】 markers and significant terms
function extractKeywords(body, id) {
  const keywords = new Map(); // word -> count

  // 1. Extract 【keyword】 markers (high priority)
  const bracketMatches = body.matchAll(/【([^】]+)】/g);
  for (const m of bracketMatches) {
    const word = m[1].trim();
    keywords.set(word, (keywords.get(word) || 0) + 3); // weight bracket keywords higher
  }

  // 2. Extract §-referenced concepts by their section titles (will be resolved later)
  // 3. Extract significant kanji compound words (2-6 chars)
  const kanjiPattern = /[\u4e00-\u9fff\u3041-\u3096\u30a1-\u30f6ー]{2,8}/g;
  const kanjiMatches = body.matchAll(kanjiPattern);
  const stopWords = new Set([
    'ことが', 'として', 'という', 'それは', 'これは', 'ここで', 'しかし',
    'つまり', 'すなわち', 'あるいは', 'ものである', 'ことである', 'である',
    'において', 'について', 'よって', 'ための', 'による', 'それが',
    'ないこと', 'あること', 'していた', 'されている', 'している', 'したこと',
    'こととは', 'ことは', 'ことの', 'ことを', 'ものは', 'ものを', 'ものの',
    'したのは', 'されたの', 'するのは', 'するもの', 'したもの',
    'ここには', 'そこには', 'それを', 'これを', 'それが', 'これが',
  ]);
  for (const m of kanjiMatches) {
    const word = m[0];
    if (word.length >= 2 && !stopWords.has(word)) {
      keywords.set(word, (keywords.get(word) || 0) + 1);
    }
  }

  // 4. Extract significant Western terms (capitalized, 4+ chars)
  const westPattern = /[A-Z][a-zA-Z]{3,}/g;
  const westMatches = body.matchAll(westPattern);
  for (const m of westMatches) {
    keywords.set(m[0], (keywords.get(m[0]) || 0) + 1);
  }

  return keywords;
}

function escapeTs(str) {
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

// ---- Main ----
async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const files = fs.readdirSync(PLATEAUS_DIR).filter(f => f.endsWith('.md')).sort();
  console.log(`Found ${files.length} plateau files.`);

  const plateaus = [];
  const allKeywords = new Map(); // word -> { plateauIds: Set, count: number }

  for (const file of files) {
    const filepath = path.join(PLATEAUS_DIR, file);
    const content = fs.readFileSync(filepath, 'utf-8');
    const { meta, body } = parseFrontmatter(content);
    plateaus.push({ id: meta.id, title: meta.title, cluster: meta.cluster, clusterName: meta.clusterName, linksTo: meta.linksTo, body });

    // Extract keywords
    const kw = extractKeywords(body, meta.id);
    for (const [word, count] of kw) {
      if (!allKeywords.has(word)) {
        allKeywords.set(word, { plateauIds: new Set(), count: 0 });
      }
      const entry = allKeywords.get(word);
      entry.plateauIds.add(meta.id);
      entry.count += count;
    }
    console.log(`  ✓ ${file} → §${meta.id} (${kw.size} keywords)`);
  }

  plateaus.sort((a, b) => a.id - b.id);

  // Auto-generate backlinks
  const linkedFromMap = new Map();
  plateaus.forEach(p => linkedFromMap.set(p.id, []));
  plateaus.forEach(p => {
    p.linksTo.forEach(targetId => {
      const arr = linkedFromMap.get(targetId);
      if (arr && !arr.includes(p.id)) arr.push(p.id);
    });
  });

  // Generate plateaus.ts
  const plateauEntries = plateaus.map(p => {
    const linkedFrom = linkedFromMap.get(p.id) || [];
    return `  {
    id: ${p.id},
    title: \`${escapeTs(p.title)}\`,
    cluster: ${p.cluster},
    clusterName: \`${escapeTs(p.clusterName)}\`,
    linksTo: [${p.linksTo.join(', ')}],
    linkedFrom: [${linkedFrom.join(', ')}],
    body: \`${escapeTs(p.body)}\`
  }`;
  });

  const plateausTs = `// Auto-generated by scripts/build-data.js — DO NOT EDIT
import type { Plateau } from '@/types/plateau'

export const PLATEAUS: Plateau[] = [
${plateauEntries.join(',\n')}
]
`;
  fs.writeFileSync(path.join(DATA_DIR, 'plateaus.ts'), plateausTs, 'utf-8');

  // Filter keywords: keep those appearing in 2+ plateaus OR with count >= 3
  const significantKeywords = [...allKeywords.entries()]
    .filter(([word, info]) => info.plateauIds.size >= 2 || info.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 300); // cap at 300

  const kwEntries = significantKeywords.map(([word, info]) => {
    const ids = [...info.plateauIds].sort((a, b) => a - b);
    return `  { word: \`${escapeTs(word)}\`, plateauIds: [${ids.join(', ')}], count: ${info.count} }`;
  });

  const keywordsTs = `// Auto-generated by scripts/build-data.js — DO NOT EDIT
import type { Keyword } from '@/types/plateau'

export const KEYWORDS: Keyword[] = [
${kwEntries.join(',\n')}
]
`;
  fs.writeFileSync(path.join(DATA_DIR, 'keywords.ts'), keywordsTs, 'utf-8');

  // ---- Markov chain transition table (kuromoji) ----
  console.log('\nLoading kuromoji dictionary...');

  const kuromoji = (await import('kuromoji')).default;
  const dictPath = path.resolve(ROOT, 'node_modules', 'kuromoji', 'dict');

  const tokenizer = await new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath: dictPath }).build((err, tok) => {
      if (err) reject(err);
      else resolve(tok);
    });
  });

  console.log('Building Markov chain with morphological analysis...');

  // Tokenize and build transition table
  const transitions = new Map(); // token -> Map(nextToken -> count)
  const starterTokens = [];
  let totalSentences = 0;

  // Meaningful POS (品詞) to keep
  const keepPos = new Set(['名詞', '動詞', '形容詞', '副詞', '接続詞', '感動詞']);
  // Sub-POS to exclude (非自立語、接尾語 etc.)
  const excludeSubPos = new Set(['非自立', '接尾', '数', '代名詞']);

  for (const p of plateaus) {
    // Split into sentences
    const sentences = p.body.split(/[。\n]/).filter(s => s.trim().length > 5);
    for (const sentence of sentences) {
      const clean = sentence.replace(/(?:→)?§\d+/g, '').replace(/【|】/g, '').trim();
      if (clean.length < 5) continue;
      const morphemes = tokenizer.tokenize(clean);

      // Build token sequence: keep content words + particles/aux for flow
      const tokens = [];
      for (const m of morphemes) {
        const surface = m.surface_form;
        const pos = m.pos;
        const subPos = m.pos_detail_1;

        // Skip empty or very short meaningless tokens
        if (!surface || surface.trim() === '') continue;

        // Keep meaningful words (surface form)
        if (keepPos.has(pos) && !excludeSubPos.has(subPos)) {
          tokens.push(surface);
        } else if (pos === '助詞' || pos === '助動詞') {
          // Attach particles to previous token for more natural flow
          if (tokens.length > 0) {
            tokens[tokens.length - 1] += surface;
          }
        }
      }

      if (tokens.length < 2) continue;
      totalSentences++;

      // Record starter
      starterTokens.push(tokens[0]);

      // Build bigram transitions
      for (let i = 0; i < tokens.length - 1; i++) {
        if (!transitions.has(tokens[i])) transitions.set(tokens[i], new Map());
        const next = transitions.get(tokens[i]);
        next.set(tokens[i + 1], (next.get(tokens[i + 1]) || 0) + 1);
      }
    }
  }

  // Convert to serializable format
  const markovTable = {};
  let tokenCount = 0;
  for (const [token, nextMap] of transitions) {
    const entries = [...nextMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12); // keep top 12 transitions per token
    if (entries.length > 0) {
      markovTable[token] = entries;
      tokenCount++;
    }
  }

  const uniqueStarters = [...new Set(starterTokens)].slice(0, 300);

  const markovTs = `// Auto-generated by scripts/build-data.js — DO NOT EDIT
// Markov chain transition table built from 35 plateau texts
// Tokenized by kuromoji.js morphological analysis

export type MarkovTable = Record<string, [string, number][]>

export const MARKOV_TABLE: MarkovTable = ${JSON.stringify(markovTable)}

export const STARTERS: string[] = ${JSON.stringify(uniqueStarters)}
`;
  fs.writeFileSync(path.join(DATA_DIR, 'markov.ts'), markovTs, 'utf-8');

  // ---- Token → Plateau reverse index ----
  console.log('Building token → plateau index...');

  const tokenToPlateau = new Map(); // word (base form) -> Set<plateauId>
  const contentPos = new Set(['名詞', '動詞', '形容詞', '副詞']);
  const excludeSub = new Set(['非自立', '接尾', '数', '代名詞']);
  const stopTokens = new Set(['する', 'いる', 'ある', 'なる', 'れる', 'られる', 'せる', 'させる', 'ない', 'よう', 'こと', 'もの', 'ところ', 'ため', 'それ', 'これ', 'どの', 'この', 'その']);

  for (const p of plateaus) {
    const clean = p.body.replace(/(?:→)?§\d+/g, '').replace(/【|】/g, '');
    const morphemes = tokenizer.tokenize(clean);
    for (const m of morphemes) {
      const surface = m.surface_form;
      const pos = m.pos;
      const subPos = m.pos_detail_1;
      if (!surface || surface.trim() === '' || surface.length < 2) continue;
      if (!contentPos.has(pos) || excludeSub.has(subPos)) continue;
      // Require at least 1 kanji, katakana, or Latin letter
      if (!/[\u4e00-\u9fff\u30a1-\u30f6A-Za-z]/.test(surface)) continue;
      if (stopTokens.has(surface)) continue;

      if (!tokenToPlateau.has(surface)) tokenToPlateau.set(surface, new Set());
      tokenToPlateau.get(surface).add(p.id);
    }
  }

  // Convert to serializable format
  const tokenIndex = {};
  let indexCount = 0;
  for (const [word, ids] of tokenToPlateau) {
    tokenIndex[word] = [...ids].sort((a, b) => a - b);
    indexCount++;
  }

  const tokenIndexTs = `// Auto-generated by scripts/build-data.js — DO NOT EDIT
// Reverse index: content word → plateau IDs where it appears
// Built via kuromoji morphological analysis of all 35 plateaus

export type TokenIndex = Record<string, number[]>

export const TOKEN_INDEX: TokenIndex = ${JSON.stringify(tokenIndex)}
`;
  fs.writeFileSync(path.join(DATA_DIR, 'tokenIndex.ts'), tokenIndexTs, 'utf-8');

  console.log(`\n✓ Generated src/data/plateaus.ts (${plateaus.length} plateaus)`);
  console.log(`✓ Generated src/data/keywords.ts (${significantKeywords.length} keywords)`);
  console.log(`✓ Generated src/data/markov.ts (${tokenCount} unique tokens, ${totalSentences} sentences, ${uniqueStarters.length} starters)`);
  console.log(`✓ Generated src/data/tokenIndex.ts (${indexCount} indexed words)`);
}

main();
