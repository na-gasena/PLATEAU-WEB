<script setup lang="ts">
import { ref } from "vue";
import { usePlateaus } from "@/composables/usePlateaus";

const { getPlateauById } = usePlateaus();

const visible = ref(false);
const previewId = ref<number | null>(null);
const x = ref(0);
const y = ref(0);

function show(id: number, event: MouseEvent) {
  previewId.value = id;
  x.value = Math.min(event.clientX + 16, window.innerWidth - 400);
  y.value = Math.min(event.clientY - 10, window.innerHeight - 200);
  visible.value = true;
}

function hide() {
  visible.value = false;
}

const plateau = () =>
  previewId.value ? getPlateauById(previewId.value) : null;

function previewLines(): string {
  const p = plateau();
  if (!p) return "";
  return p.body
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 4)
    .join("\n");
}

defineExpose({ show, hide });
</script>

<template>
  <div
    v-if="visible && previewId"
    class="hover-preview"
    :style="{ left: x + 'px', top: y + 'px' }"
  >
    <div class="hp-title">§{{ plateau()?.id }} {{ plateau()?.title }}</div>
    <div class="hp-body">{{ previewLines() }}</div>
  </div>
</template>
