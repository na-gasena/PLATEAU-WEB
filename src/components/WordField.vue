<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from "vue";
import { usePlateaus } from "@/composables/usePlateaus";
import {
  useMarkov,
  type PoemLine,
  type PoemToken,
  type TokenAlternative,
} from "@/composables/useMarkov";

const {
  currentKeywords,
  currentId,
  navigateWithHighlight,
  getClusterColor,
  getPlateauById,
  getKeywordSnippet,
  selectedKeyword,
  selectKeyword,
  keywords,
  poemTrail,
  addToPoemTrail,
  clearPoemTrail,
} = usePlateaus();

const {
  generatePoem,
  getKeywordFromToken,
  getAlternatives,
  getPlateauIdsForToken,
} = useMarkov();

// -- State --
type TabId = "generate" | "trail";
const activeTab = ref<TabId>("generate");
const poemLines = ref<PoemLine[]>([]);
const poemSeed = ref<string | null>(null);
const isEditing = ref(false);
const editText = ref("");

// -- Hover alternatives tooltip --
const hoveredToken = ref<{ lineIdx: number; tokenIdx: number } | null>(null);
const tooltipPos = ref({ x: 0, y: 0 });
const alternatives = ref<TokenAlternative[]>([]);
const focusedIndex = ref(-1);
let isOverToken = false;
let isOverTooltip = false;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function onKeyDown(e: KeyboardEvent) {
  if (!hoveredToken.value || alternatives.value.length <= 1) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    focusedIndex.value = Math.min(
      focusedIndex.value + 1,
      alternatives.value.length - 1,
    );
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    focusedIndex.value = Math.max(focusedIndex.value - 1, 0);
  } else if (e.key === "Enter" && focusedIndex.value >= 0) {
    e.preventDefault();
    const alt = alternatives.value[focusedIndex.value];
    if (alt && !alt.isSelected) replaceToken(alt);
  } else if (e.key === "Escape") {
    e.preventDefault();
    hoveredToken.value = null;
  }
}

onMounted(() => document.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => document.removeEventListener("keydown", onKeyDown));

function scheduleHide() {
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!isOverToken && !isOverTooltip) {
      hoveredToken.value = null;
    }
  }, 300);
}

function cancelHide() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function onTokenMouseEnter(
  e: MouseEvent,
  lineIdx: number,
  tokenIdx: number,
  token: PoemToken,
) {
  if (isEditing.value) return;

  const alts = getAlternatives(token.prevToken);
  if (alts.length === 0) return;

  isOverToken = true;
  cancelHide();
  focusedIndex.value = -1;

  alternatives.value = alts.map((a) => ({
    ...a,
    isSelected: a.text === token.text,
  }));

  const rect = (e.target as HTMLElement).getBoundingClientRect();
  tooltipPos.value = {
    x: Math.min(rect.right + 8, window.innerWidth - 280),
    y: Math.min(rect.top - 20, window.innerHeight - 290),
  };
  hoveredToken.value = { lineIdx, tokenIdx };
}

function onTokenMouseLeave() {
  isOverToken = false;
  scheduleHide();
}

function onTooltipEnter() {
  isOverTooltip = true;
  cancelHide();
}

function onTooltipLeave() {
  isOverTooltip = false;
  scheduleHide();
}

function replaceToken(alt: TokenAlternative) {
  if (!hoveredToken.value) return;
  const { lineIdx, tokenIdx } = hoveredToken.value;
  const line = poemLines.value[lineIdx];
  if (!line || !line.tokens[tokenIdx]) return;

  const oldToken = line.tokens[tokenIdx];
  line.tokens[tokenIdx] = {
    text: alt.text,
    isKeyword: alt.isKeyword,
    prevToken: oldToken.prevToken,
    probability: alt.probability,
  };

  // Update the NEXT token's prevToken and recalculate its probability
  const nextToken = line.tokens[tokenIdx + 1];
  if (nextToken) {
    nextToken.prevToken = alt.text;
    // Recalculate next token's probability given the new predecessor
    const nextAlts = getAlternatives(alt.text);
    const match = nextAlts.find((a) => a.text === nextToken.text);
    nextToken.probability = match ? match.probability : 0;
  }

  // Update alternatives to reflect new selection
  alternatives.value = alternatives.value.map((a) => ({
    ...a,
    isSelected: a.text === alt.text,
  }));

  poemLines.value = [...poemLines.value];
}

// -- Tag Cloud --
function fontSize(count: number): string {
  return Math.max(11, Math.min(22, 10 + count * 1.5)) + "px";
}

function opacity(count: number): number {
  return Math.max(0.5, Math.min(1, 0.4 + count * 0.08));
}

function formatPct(p: number): string {
  return (p * 100).toFixed(0) + "%";
}

// -- Poem Generation --
function onTagClick(word: string) {
  poemSeed.value = word;
  poemLines.value = generatePoem(word, 3, 8);
  isEditing.value = false;
  selectKeyword(null);
  activeTab.value = "generate";
  addToPoemTrail(word);
}

function onTagRightClick(e: MouseEvent, word: string) {
  e.preventDefault();
  selectKeyword(selectedKeyword.value === word ? null : word);
}

function regeneratePoem() {
  if (poemSeed.value) {
    poemLines.value = generatePoem(poemSeed.value, 3, 8);
    isEditing.value = false;
  }
}

function clearPoem() {
  poemLines.value = [];
  poemSeed.value = null;
  isEditing.value = false;
}

function enterEditMode() {
  editText.value = poemLines.value
    .map((l) => l.tokens.map((t) => t.text).join(""))
    .join("\n");
  isEditing.value = true;
}

function exitEditMode() {
  isEditing.value = false;
}

function onPoemTokenClick(text: string) {
  const kw = getKeywordFromToken(text);
  if (kw) {
    selectKeyword(selectedKeyword.value === kw ? null : kw);
    addToPoemTrail(kw);
  }
}

// -- Trail Poem --
function onTrailWordClick(word: string) {
  selectKeyword(selectedKeyword.value === word ? null : word);
}

const trailPoemDisplay = computed(() => {
  if (poemTrail.value.length === 0) return [];
  const lines: string[][] = [];
  const lineLen = 4;
  for (let i = 0; i < poemTrail.value.length; i += lineLen) {
    lines.push(poemTrail.value.slice(i, i + lineLen));
  }
  return lines;
});

// -- Related Plateaus Panel --
function getRelatedPlateaus(word: string) {
  // First check the 300 curated keywords
  const kw =
    currentKeywords.value.find((k) => k.word === word) ||
    keywords.find((k) => k.word === word);

  // Get plateau IDs — from keywords or from full token index
  const plateauIds = kw ? kw.plateauIds : getPlateauIdsForToken(word);
  if (plateauIds.length === 0) return [];

  return plateauIds
    .map((id) => {
      const p = getPlateauById(id);
      if (!p) return null;
      return {
        id: p.id,
        title: p.title,
        cluster: p.cluster,
        snippet: getKeywordSnippet(id, word),
        isCurrent: id === currentId.value,
      };
    })
    .filter(Boolean) as any[];
}

function onPlateauSelect(id: number, word: string) {
  navigateWithHighlight(id, word);
}

function highlightInSnippet(snippet: string, word: string): string {
  if (!snippet || !word) return snippet;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return snippet.replace(
    new RegExp(escaped, "g"),
    `<mark class="kp-mark">${word}</mark>`,
  );
}

watch(currentId, () => {
  selectKeyword(null);
  poemLines.value = [];
  poemSeed.value = null;
  isEditing.value = false;
});
</script>

<template>
  <div class="word-field">
    <div class="word-field-header">
      <h3>◉ ワードフィールド</h3>
      <div class="wf-tabs">
        <button
          class="wf-tab"
          :class="{ active: activeTab === 'generate' }"
          @click="activeTab = 'generate'"
        >
          生成詩
        </button>
        <button
          class="wf-tab"
          :class="{ active: activeTab === 'trail' }"
          @click="activeTab = 'trail'"
        >
          軌跡詩<span v-if="poemTrail.length" class="trail-count">{{
            poemTrail.length
          }}</span>
        </button>
      </div>
      <span class="word-field-hint"
        >クリック→詩を生成 ／ 右クリック→関連プラトー</span
      >
    </div>

    <div class="word-field-content">
      <div class="wf-left" :class="{ 'has-panel': selectedKeyword }">
        <!-- Tag Cloud -->
        <div class="tag-cloud">
          <span
            v-for="kw in currentKeywords"
            :key="kw.word"
            class="tag"
            :class="{
              selected: selectedKeyword === kw.word,
              'is-seed': poemSeed === kw.word,
            }"
            :style="{
              fontSize: fontSize(kw.count),
              opacity:
                selectedKeyword && selectedKeyword !== kw.word
                  ? 0.3
                  : opacity(kw.count),
            }"
            :title="`${kw.word} — ${kw.plateauIds.length}件`"
            @click="onTagClick(kw.word)"
            @contextmenu="onTagRightClick($event, kw.word)"
            >{{ kw.word }}</span
          >
        </div>

        <!-- Tab: Generated Poem -->
        <div v-if="activeTab === 'generate'" class="poem-area">
          <template v-if="poemLines.length > 0">
            <div class="poem-header">
              <span class="poem-label">✎ 生成詩</span>
              <span class="poem-seed">種語: {{ poemSeed }}</span>
              <button class="poem-btn" title="再生成" @click="regeneratePoem">
                🎲
              </button>
              <button
                class="poem-btn"
                :class="{ active: isEditing }"
                title="編集モード"
                @click="isEditing ? exitEditMode() : enterEditMode()"
              >
                ✏️
              </button>
              <button class="poem-btn" title="クリア" @click="clearPoem">
                ×
              </button>
            </div>
            <div v-if="!isEditing" class="poem-body">
              <div v-for="(line, li) in poemLines" :key="li" class="poem-line">
                <span
                  v-for="(token, ti) in line.tokens"
                  :key="ti"
                  class="poem-token"
                  :class="{
                    keyword: token.isKeyword,
                    hovered:
                      hoveredToken?.lineIdx === li &&
                      hoveredToken?.tokenIdx === ti,
                  }"
                  @click="token.isKeyword && onPoemTokenClick(token.text)"
                  @mouseenter="onTokenMouseEnter($event, li, ti, token)"
                  @mouseleave="onTokenMouseLeave"
                  >{{ token.text
                  }}<sup
                    v-if="token.prevToken !== null && token.probability < 0.99"
                    class="prob-badge"
                    >{{ formatPct(token.probability) }}</sup
                  ></span
                >
              </div>
            </div>
            <div v-else class="poem-edit-area">
              <textarea
                v-model="editText"
                class="poem-textarea"
                rows="5"
                placeholder="詩を編集…"
              ></textarea>
              <div class="edit-hint">
                自由に書き換えてください。閲覧モードでキーワードリンクが有効になります。
              </div>
            </div>
          </template>
          <div v-else class="poem-empty">
            <span>タグをクリックして詩を生成</span>
          </div>
        </div>

        <!-- Tab: Trail Poem -->
        <div v-if="activeTab === 'trail'" class="poem-area">
          <template v-if="poemTrail.length > 0">
            <div class="poem-header">
              <span class="poem-label">☽ 軌跡詩</span>
              <span class="poem-seed">{{ poemTrail.length }}語の旅路</span>
              <button
                class="poem-btn"
                title="軌跡クリア"
                @click="clearPoemTrail"
              >
                ×
              </button>
            </div>
            <div class="poem-body trail-poem">
              <div
                v-for="(line, li) in trailPoemDisplay"
                :key="li"
                class="poem-line"
              >
                <span
                  v-for="(word, wi) in line"
                  :key="wi"
                  class="poem-token keyword"
                  @click="onTrailWordClick(word)"
                  >{{ word }}</span
                >
                <span
                  v-if="li < trailPoemDisplay.length - 1"
                  class="trail-break"
                  >—</span
                >
              </div>
            </div>
          </template>
          <div v-else class="poem-empty">
            <span>タグクラウドでキーワードを踏むたびに軌跡が詩になります</span>
          </div>
        </div>
      </div>

      <!-- Keyword Panel -->
      <div v-if="selectedKeyword" class="keyword-panel">
        <div class="kp-header">
          <span class="kp-word">{{ selectedKeyword }}</span>
          <span class="kp-count"
            >{{ getRelatedPlateaus(selectedKeyword).length }}件</span
          >
          <button class="kp-close" @click="selectKeyword(null)">×</button>
        </div>
        <div class="kp-list">
          <div
            v-for="p in getRelatedPlateaus(selectedKeyword)"
            :key="p.id"
            class="kp-item"
            :class="{ current: p.isCurrent }"
            @click="!p.isCurrent && onPlateauSelect(p.id, selectedKeyword!)"
          >
            <div class="kp-item-head">
              <span
                class="kp-num"
                :style="{ color: getClusterColor(p.cluster) }"
                >§{{ p.id }}</span
              >
              <span class="kp-title">{{ p.title }}</span>
              <span v-if="p.isCurrent" class="kp-current-badge">現在</span>
            </div>
            <div
              class="kp-snippet"
              v-html="highlightInSnippet(p.snippet, selectedKeyword!)"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Markov Alternatives Tooltip (teleported to body-level) -->
    <Teleport to="body">
      <div
        v-if="hoveredToken && alternatives.length > 0"
        class="markov-tooltip"
        :style="{ left: tooltipPos.x + 'px', top: tooltipPos.y + 'px' }"
        @mouseenter="onTooltipEnter"
        @mouseleave="onTooltipLeave"
      >
        <div class="mt-header">マルコフ連鎖の分岐</div>
        <div class="mt-list">
          <div
            v-for="(alt, ai) in alternatives"
            :key="alt.text"
            class="mt-item"
            :class="{
              selected: alt.isSelected,
              keyword: alt.isKeyword,
              focused: ai === focusedIndex,
            }"
            @click="!alt.isSelected && replaceToken(alt)"
          >
            <span class="mt-word">{{ alt.text }}</span>
            <div class="mt-bar-wrap">
              <div
                class="mt-bar"
                :style="{ width: alt.probability * 100 + '%' }"
              ></div>
            </div>
            <span class="mt-pct">{{ formatPct(alt.probability) }}</span>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.word-field {
  border-top: 1px solid var(--border);
  max-height: 420px;
  display: flex;
  flex-direction: column;
  background: rgba(10, 14, 26, 0.7);
}
.word-field-header {
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(42, 52, 86, 0.3);
}
.word-field-header h3 {
  font-size: 12px;
  color: var(--accent);
  font-weight: 600;
  letter-spacing: 0.05em;
}
.word-field-hint {
  font-size: 9px;
  color: var(--text-muted);
  margin-left: auto;
}
.wf-tabs {
  display: flex;
  gap: 2px;
}
.wf-tab {
  padding: 3px 10px;
  font-size: 11px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  position: relative;
}
.wf-tab.active {
  background: rgba(108, 140, 255, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}
.wf-tab:hover {
  color: var(--text-primary);
}
.trail-count {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #ff6b8a;
  color: #fff;
  font-size: 8px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}
.word-field-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}
.wf-left {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.wf-left.has-panel {
  flex: 0 0 calc(100% - 320px);
}
.tag-cloud {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 4px 6px;
  padding: 6px 16px 6px;
  overflow-y: auto;
  max-height: 100px;
  flex-shrink: 0;
}
.tag {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(108, 140, 255, 0.08);
  border: 1px solid rgba(108, 140, 255, 0.15);
  border-radius: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  line-height: 1.3;
  white-space: nowrap;
  font-family: var(--font-sans);
}
.tag:hover {
  background: rgba(108, 140, 255, 0.18);
  border-color: var(--accent);
  color: var(--text-primary);
}
.tag.selected {
  background: rgba(255, 215, 108, 0.15);
  border-color: #ffd76c;
  color: #ffd76c;
  font-weight: 600;
  opacity: 1 !important;
}
.tag.is-seed {
  background: rgba(108, 255, 192, 0.12);
  border-color: #6cffc0;
  color: #6cffc0;
}
.poem-area {
  flex: 1;
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.poem-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
.poem-header {
  padding: 5px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.poem-label {
  font-size: 11px;
  color: #6cffc0;
  font-weight: 600;
}
.poem-seed {
  font-size: 10px;
  color: var(--text-muted);
}
.poem-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 6px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s;
  line-height: 1.4;
}
.poem-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}
.poem-btn.active {
  border-color: #ffd76c;
  color: #ffd76c;
}
.poem-body {
  padding: 4px 20px 12px;
  overflow-y: auto;
  flex: 1;
}
.poem-line {
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 2.2;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.poem-token {
  transition: all 0.15s;
  position: relative;
  cursor: default;
}
.poem-token.keyword {
  color: #ffd76c;
  cursor: pointer;
  border-bottom: 1px dotted rgba(255, 215, 108, 0.4);
}
.poem-token.keyword:hover {
  background: rgba(255, 215, 108, 0.15);
  border-radius: 2px;
}
.poem-token.hovered {
  background: rgba(108, 140, 255, 0.12);
  border-radius: 2px;
}
.prob-badge {
  font-size: 8px;
  color: var(--text-muted);
  font-family: var(--font-sans);
  margin-left: 1px;
  vertical-align: super;
  opacity: 0.6;
}
.trail-poem .poem-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
}
.trail-break {
  color: var(--text-muted);
  font-size: 12px;
  margin: 0 2px;
}
.poem-edit-area {
  flex: 1;
  padding: 4px 16px 12px;
  display: flex;
  flex-direction: column;
}
.poem-textarea {
  flex: 1;
  width: 100%;
  resize: none;
  background: rgba(20, 26, 46, 0.8);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  color: var(--text-primary);
  font-family: var(--font-serif);
  font-size: 15px;
  line-height: 2;
  outline: none;
}
.poem-textarea:focus {
  border-color: #ffd76c;
  box-shadow: 0 0 12px rgba(255, 215, 108, 0.15);
}
.edit-hint {
  font-size: 10px;
  color: var(--text-muted);
  margin-top: 4px;
}
.keyword-panel {
  width: 320px;
  flex-shrink: 0;
  background: rgba(15, 20, 36, 0.97);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  animation: slideIn 0.2s ease-out;
}
@keyframes slideIn {
  from {
    transform: translateX(20px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
.kp-header {
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.kp-word {
  font-weight: 700;
  color: #ffd76c;
  font-size: 14px;
}
.kp-count {
  font-size: 10px;
  color: var(--text-muted);
}
.kp-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 16px;
  cursor: pointer;
  padding: 0 4px;
}
.kp-close:hover {
  color: #ff6b8a;
}
.kp-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}
.kp-item {
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(42, 52, 86, 0.4);
}
.kp-item:hover:not(.current) {
  background: rgba(108, 140, 255, 0.08);
}
.kp-item.current {
  opacity: 0.5;
  cursor: default;
}
.kp-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.kp-num {
  font-size: 11px;
  font-weight: 600;
}
.kp-title {
  font-size: 12px;
  font-weight: 600;
}
.kp-current-badge {
  font-size: 9px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--border);
  color: var(--text-muted);
  margin-left: auto;
}
.kp-snippet {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
  font-family: var(--font-serif);
}
.kp-snippet :deep(.kp-mark) {
  background: rgba(255, 215, 108, 0.3);
  color: #ffd76c;
  padding: 0 2px;
  border-radius: 2px;
}
</style>

<!-- Global styles for the teleported tooltip -->
<style>
.markov-tooltip {
  position: fixed;
  z-index: 500;
  width: 260px;
  max-height: 280px;
  padding-top: 6px;
  background: rgba(15, 20, 36, 0.97);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(108, 140, 255, 0.3);
  border-radius: 10px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  animation: tooltipIn 0.15s ease-out;
}
@keyframes tooltipIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.mt-header {
  padding: 6px 12px;
  font-size: 10px;
  color: #6c8cff;
  font-weight: 600;
  border-bottom: 1px solid rgba(42, 52, 86, 0.5);
  letter-spacing: 0.05em;
}
.mt-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px 0;
}
.mt-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.12s;
  font-size: 13px;
}
.mt-item:hover:not(.selected) {
  background: rgba(108, 140, 255, 0.1);
}
.mt-item.focused {
  background: rgba(108, 140, 255, 0.18);
  outline: 1px solid rgba(108, 140, 255, 0.4);
  outline-offset: -1px;
}
.mt-item.selected {
  background: rgba(108, 255, 192, 0.08);
}
.mt-item.selected .mt-word {
  color: #6cffc0;
  font-weight: 600;
}
.mt-item.keyword .mt-word {
  color: #ffd76c;
}
.mt-word {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #e8eaf0;
  font-family: "Noto Serif JP", serif;
}
.mt-bar-wrap {
  width: 60px;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  flex-shrink: 0;
}
.mt-bar {
  height: 100%;
  background: linear-gradient(90deg, #6c8cff, #a78bfa);
  border-radius: 2px;
  transition: width 0.2s;
}
.mt-item.selected .mt-bar {
  background: linear-gradient(90deg, #6cffc0, #6ce0ff);
}
.mt-pct {
  font-size: 10px;
  color: #6b7394;
  min-width: 28px;
  text-align: right;
  font-family: "Noto Sans JP", sans-serif;
}
</style>
