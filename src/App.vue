<script setup lang="ts">
import NetworkGraph from "./components/NetworkGraph.vue";
import TextPanel from "./components/TextPanel.vue";
import TrailBar from "./components/TrailBar.vue";
import SearchBox from "./components/SearchBox.vue";
import ClusterFilter from "./components/ClusterFilter.vue";
import HoverPreview from "./components/HoverPreview.vue";
import WordField from "./components/WordField.vue";
import { usePlateaus } from "./composables/usePlateaus";
import { ref } from "vue";

const { currentPlateau, navigateRandom, showWordField, toggleWordField } =
  usePlateaus();

const graphPanelWidth = ref(45);
const isDragging = ref(false);
const hoverPreviewRef = ref<InstanceType<typeof HoverPreview> | null>(null);

function onHover(id: number, event: MouseEvent) {
  hoverPreviewRef.value?.show(id, event);
}
function onHoverEnd() {
  hoverPreviewRef.value?.hide();
}

function onDividerDown() {
  isDragging.value = true;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function onMouseMove(e: MouseEvent) {
  if (!isDragging.value) return;
  const main = document.getElementById("main");
  if (!main) return;
  const rect = main.getBoundingClientRect();
  const pct = ((e.clientX - rect.left) / rect.width) * 100;
  graphPanelWidth.value = Math.max(20, Math.min(70, pct));
}

function onMouseUp() {
  isDragging.value = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

// Dice animation
const diceRotation = ref(0);
function onDiceClick() {
  diceRotation.value += 360 + Math.random() * 360;
  navigateRandom();
}
</script>

<template>
  <div class="app" @mousemove="onMouseMove" @mouseup="onMouseUp">
    <!-- Header -->
    <header id="header">
      <div class="header-left">
        <h1>機械と詩のあいだ</h1>
        <span class="subtitle">35のプラトー</span>
      </div>
      <div class="header-center">
        <SearchBox />
      </div>
      <div class="header-right">
        <button
          id="diceBtn"
          title="骰子の一振り（ランダム）"
          :style="{ transform: `rotate(${diceRotation}deg)` }"
          @click="onDiceClick"
        >
          🎲
        </button>
        <button
          v-if="currentPlateau"
          class="word-field-toggle"
          :class="{ active: showWordField }"
          title="ワードフィールド表示切替"
          @click="toggleWordField"
        >
          ◉
        </button>
        <ClusterFilter />
      </div>
    </header>

    <!-- Main -->
    <main id="main">
      <div id="graphPanel" :style="{ width: graphPanelWidth + '%' }">
        <NetworkGraph @hover="onHover" @hover-end="onHoverEnd" />
      </div>
      <div
        id="divider"
        :class="{ dragging: isDragging }"
        @mousedown.prevent="onDividerDown"
      ></div>
      <div id="textPanel">
        <TextPanel @hover="onHover" @hover-end="onHoverEnd" />
        <WordField v-if="showWordField && currentPlateau" />
      </div>
    </main>

    <!-- Trail Bar -->
    <TrailBar />

    <!-- Hover Preview -->
    <HoverPreview ref="hoverPreviewRef" />
  </div>
</template>

<style scoped>
.word-field-toggle {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.2s;
  line-height: 1;
}
.word-field-toggle.active {
  color: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}
.word-field-toggle:hover {
  color: var(--accent);
}
</style>
