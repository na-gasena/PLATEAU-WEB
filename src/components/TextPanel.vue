<script setup lang="ts">
import { computed, watch, ref, nextTick } from "vue";
import { usePlateaus } from "@/composables/usePlateaus";

const {
  currentPlateau,
  currentId,
  highlightWord,
  navigateTo,
  getClusterColor,
  getPlateauById,
} = usePlateaus();

const panelRef = ref<HTMLDivElement | null>(null);

const emit = defineEmits<{
  (e: "hover", id: number, event: MouseEvent): void;
  (e: "hoverEnd"): void;
}>();

// Process body text: convert §XX refs to links, 【】to keywords, highlight active word
function processBody(body: string, highlight: string | null): string {
  let html = escapeHtml(body);
  // Convert →§XX or §XX references
  html = html.replace(
    /(?:→)?§(\d+)(?:\s+[^→\n§【】]{1,30})?/g,
    (match, num) => {
      const refId = parseInt(num);
      if (refId >= 1 && refId <= 35) {
        return `<a class="ref-link" data-id="${refId}" title="§${refId}">${match}</a>`;
      }
      return match;
    },
  );
  // Convert 【keyword】
  html = html.replace(/【([^】]+)】/g, '<span class="keyword">【$1】</span>');
  // Highlight the active keyword from word field navigation
  if (highlight) {
    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(
      new RegExp(`(?<![">])${escaped}(?![<"])`, "g"),
      `<mark class="word-highlight">${highlight}</mark>`,
    );
  }
  return html;
}

function escapeHtml(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// Handle clicks on ref-links via event delegation
function onBodyClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.classList.contains("ref-link")) {
    e.preventDefault();
    const id = parseInt(target.dataset.id || "");
    if (id) navigateTo(id);
  }
}

function onBodyMouseOver(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.classList.contains("ref-link")) {
    const id = parseInt(target.dataset.id || "");
    if (id) emit("hover", id, e);
  }
}

function onBodyMouseOut(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.classList.contains("ref-link")) {
    emit("hoverEnd");
  }
}

const bodyHtml = computed(() => {
  if (!currentPlateau.value) return "";
  return processBody(currentPlateau.value.body, highlightWord.value);
});

const clusterColor = computed(() => {
  if (!currentPlateau.value) return "";
  return getClusterColor(currentPlateau.value.cluster);
});

// Scroll to top when navigating
watch(currentId, () => {
  nextTick(() => {
    if (panelRef.value) panelRef.value.scrollTop = 0;
  });
});
</script>

<template>
  <div ref="panelRef" class="text-panel-inner">
    <!-- Welcome -->
    <div v-if="!currentPlateau" class="welcome-screen">
      <div class="welcome-content">
        <h2>プラトーを選んでください</h2>
        <p>
          左のネットワークからノードをクリック、<br />または 🎲
          ボタンでランダムに始められます。
        </p>
        <p class="welcome-sub">どこから読み始めてもよい。</p>
      </div>
    </div>

    <!-- Text Content -->
    <div v-else class="text-content">
      <div class="text-header">
        <span class="section-number">§{{ currentPlateau.id }}</span>
        <h2>{{ currentPlateau.title }}</h2>
        <div
          class="cluster-badge"
          :style="{
            color: clusterColor,
            borderColor: clusterColor,
            backgroundColor: clusterColor + '15',
          }"
        >
          {{ currentPlateau.clusterName }}
        </div>
      </div>

      <div
        class="text-body"
        v-html="bodyHtml"
        @click="onBodyClick"
        @mouseover="onBodyMouseOver"
        @mouseout="onBodyMouseOut"
      ></div>

      <!-- Backlinks -->
      <div v-if="currentPlateau.linkedFrom.length" class="backlinks">
        <h3>← このプラトーを参照しているもの</h3>
        <div class="link-chips">
          <span
            v-for="refId in currentPlateau.linkedFrom"
            :key="refId"
            class="link-chip"
            :style="{
              borderLeftColor: getClusterColor(
                getPlateauById(refId)?.cluster || 1,
              ),
            }"
            @click="navigateTo(refId)"
            >§{{ refId }} {{ getPlateauById(refId)?.title }}</span
          >
        </div>
      </div>

      <!-- Forward links -->
      <div v-if="currentPlateau.linksTo.length" class="forward-links">
        <h3>→ このプラトーが参照しているもの</h3>
        <div class="link-chips">
          <span
            v-for="refId in currentPlateau.linksTo"
            :key="refId"
            class="link-chip"
            :style="{
              borderLeftColor: getClusterColor(
                getPlateauById(refId)?.cluster || 1,
              ),
            }"
            @click="navigateTo(refId)"
            >§{{ refId }} {{ getPlateauById(refId)?.title }}</span
          >
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-panel-inner {
  height: 100%;
  overflow-y: auto;
  scroll-behavior: smooth;
}
.welcome-screen {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.text-content {
  padding: 32px 40px 60px;
  max-width: 720px;
}
.link-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
