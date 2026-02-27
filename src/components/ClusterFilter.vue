<script setup lang="ts">
import { usePlateaus } from "@/composables/usePlateaus";

const { clusters, activeCluster, setClusterFilter, getClusterColor } =
  usePlateaus();

function toggle(id: number) {
  if (activeCluster.value === id) {
    setClusterFilter(null);
  } else {
    setClusterFilter(id);
  }
}
</script>

<template>
  <div class="cluster-filter">
    <span
      v-for="c in clusters"
      :key="c.id"
      class="cf-btn"
      :class="{ active: activeCluster === c.id }"
      :style="{ background: c.color }"
      :title="c.name"
      @click="toggle(c.id)"
    ></span>
  </div>
</template>
