<script setup lang="ts">
import { ref } from "vue";
import { usePlateaus } from "@/composables/usePlateaus";

const { searchPlateaus, navigateTo, getClusterColor } = usePlateaus();

const query = ref("");
const results = ref<ReturnType<typeof searchPlateaus>>([]);
const isOpen = ref(false);

function onInput() {
  results.value = searchPlateaus(query.value);
  isOpen.value = results.value.length > 0;
}

function onSelect(id: number) {
  navigateTo(id);
  query.value = "";
  isOpen.value = false;
}

function onEscape() {
  isOpen.value = false;
}

function getSnippet(body: string, q: string): string {
  const lower = body.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return "";
  const start = Math.max(0, idx - 20);
  const end = Math.min(body.length, idx + q.length + 40);
  return "…" + body.substring(start, end).replace(/\n/g, " ") + "…";
}
</script>

<template>
  <div class="search-box" @click.stop>
    <input
      v-model="query"
      type="text"
      placeholder="キーワード検索…"
      autocomplete="off"
      @input="onInput"
      @keydown.escape="onEscape"
    />
    <div v-if="isOpen" class="search-results">
      <div
        v-for="p in results"
        :key="p.id"
        class="search-result-item"
        @click="onSelect(p.id)"
      >
        <span class="sr-num" :style="{ color: getClusterColor(p.cluster) }"
          >§{{ p.id }}</span
        >
        <span class="sr-title">{{ p.title }}</span>
        <span v-if="query.length >= 2" class="sr-snippet">{{
          getSnippet(p.body, query)
        }}</span>
      </div>
    </div>
  </div>
</template>
