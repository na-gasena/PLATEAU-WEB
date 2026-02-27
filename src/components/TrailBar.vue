<script setup lang="ts">
import { usePlateaus } from "@/composables/usePlateaus";

const { trail, currentId, navigateTo, clearTrail } = usePlateaus();
</script>

<template>
  <footer id="trailBar">
    <span class="trail-label">読書軌跡:</span>
    <div class="trail-items">
      <template v-for="(id, i) in trail" :key="i">
        <span v-if="i > 0" class="trail-arrow">→</span>
        <span
          class="trail-node"
          :class="{ active: id === currentId }"
          @click="navigateTo(id)"
          >§{{ id }}</span
        >
      </template>
    </div>
    <button class="trail-clear" title="軌跡をクリア" @click="clearTrail">
      ×
    </button>
  </footer>
</template>
