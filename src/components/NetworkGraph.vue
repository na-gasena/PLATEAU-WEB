<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue";
import * as d3 from "d3";
import { usePlateaus, CLUSTER_COLOR_MAP } from "@/composables/usePlateaus";
import type { GraphNode, GraphLink } from "@/types/plateau";

const {
  plateaus,
  currentId,
  trail,
  activeCluster,
  navigateTo,
  getClusterColor,
} = usePlateaus();

const svgRef = ref<SVGSVGElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

let simulation: d3.Simulation<GraphNode, GraphLink> | null = null;
let svgSelection: d3.Selection<SVGSVGElement, unknown, null, undefined> | null =
  null;
let linkElements: d3.Selection<
  SVGLineElement,
  GraphLink,
  SVGGElement,
  unknown
> | null = null;
let nodeGroups: d3.Selection<
  SVGGElement,
  GraphNode,
  SVGGElement,
  unknown
> | null = null;
let gSelection: d3.Selection<SVGGElement, unknown, null, undefined> | null =
  null;
let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;

const emit = defineEmits<{
  (e: "hover", id: number, event: MouseEvent): void;
  (e: "hoverEnd"): void;
}>();

// Build graph data
const nodes: GraphNode[] = plateaus.map((p) => ({
  id: p.id,
  title: p.title,
  cluster: p.cluster,
  clusterName: p.clusterName,
  radius: 8 + Math.max(p.linksTo.length, p.linkedFrom.length) * 1.5,
}));

const links: GraphLink[] = [];
const linkSet = new Set<string>();
plateaus.forEach((p) => {
  p.linksTo.forEach((targetId) => {
    const key = `${Math.min(p.id, targetId)}-${Math.max(p.id, targetId)}`;
    if (!linkSet.has(key)) {
      linkSet.add(key);
      links.push({ source: p.id, target: targetId });
    }
  });
});

function initGraph() {
  if (!svgRef.value || !containerRef.value) return;
  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;

  svgSelection = d3
    .select(svgRef.value)
    .attr("width", width)
    .attr("height", height);

  svgSelection.selectAll("*").remove();

  // Glow filter
  const defs = svgSelection.append("defs");
  const filter = defs.append("filter").attr("id", "glow");
  filter
    .append("feGaussianBlur")
    .attr("stdDeviation", "3")
    .attr("result", "coloredBlur");
  const feMerge = filter.append("feMerge");
  feMerge.append("feMergeNode").attr("in", "coloredBlur");
  feMerge.append("feMergeNode").attr("in", "SourceGraphic");

  gSelection = svgSelection.append("g").attr("class", "graph-container");

  // Zoom
  zoomBehavior = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 4])
    .on("zoom", (event) => {
      gSelection!.attr("transform", event.transform);
    });
  svgSelection.call(zoomBehavior);

  // Links
  const linkG = gSelection.append("g").attr("class", "links");
  linkElements = linkG
    .selectAll<SVGLineElement, GraphLink>("line")
    .data(links)
    .join("line")
    .attr("class", "link-line");

  // Nodes
  const nodeG = gSelection.append("g").attr("class", "nodes");
  nodeGroups = nodeG
    .selectAll<SVGGElement, GraphNode>("g")
    .data(nodes)
    .join("g")
    .attr("class", "node-group")
    .on("click", (_event, d) => navigateTo(d.id))
    .on("mouseenter", (event, d) => emit("hover", d.id, event))
    .on("mouseleave", () => emit("hoverEnd"))
    .call(
      d3
        .drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) simulation!.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation!.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }),
    );

  nodeGroups
    .append("circle")
    .attr("class", "node-circle")
    .attr("r", (d) => d.radius)
    .attr("fill", (d) => getClusterColor(d.cluster))
    .attr("opacity", 0.85)
    .style("filter", "url(#glow)");

  nodeGroups
    .append("text")
    .attr("class", "node-label")
    .attr("dy", (d) => d.radius + 14)
    .text((d) => `§${d.id}`);

  // Simulation
  simulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink<GraphNode, GraphLink>(links)
        .id((d) => d.id)
        .distance(80)
        .strength(0.4),
    )
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force(
      "collision",
      d3.forceCollide<GraphNode>().radius((d) => d.radius + 8),
    )
    .force("x", d3.forceX(width / 2).strength(0.05))
    .force("y", d3.forceY(height / 2).strength(0.05))
    .on("tick", () => {
      linkElements!
        .attr("x1", (d) => (d.source as GraphNode).x!)
        .attr("y1", (d) => (d.source as GraphNode).y!)
        .attr("x2", (d) => (d.target as GraphNode).x!)
        .attr("y2", (d) => (d.target as GraphNode).y!);
      nodeGroups!.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });
}

function updateHighlights() {
  if (!linkElements || !nodeGroups) return;
  const id = currentId.value;
  if (id === null) {
    linkElements.classed("highlighted", false).classed("trail-edge", false);
    nodeGroups
      .selectAll<SVGCircleElement, GraphNode>(".node-circle")
      .attr("opacity", 0.85)
      .classed("active", false);
    nodeGroups
      .selectAll<SVGTextElement, GraphNode>(".node-label")
      .attr("opacity", 1)
      .classed("active", false);
    return;
  }

  const p = plateaus.find((p) => p.id === id);
  if (!p) return;
  const connected = new Set([...p.linksTo, ...p.linkedFrom, id]);

  linkElements
    .classed(
      "highlighted",
      (d) =>
        (d.source as GraphNode).id === id || (d.target as GraphNode).id === id,
    )
    .classed("trail-edge", (d) => {
      for (let i = 0; i < trail.value.length - 1; i++) {
        const a = trail.value[i],
          b = trail.value[i + 1];
        if (
          ((d.source as GraphNode).id === a &&
            (d.target as GraphNode).id === b) ||
          ((d.source as GraphNode).id === b && (d.target as GraphNode).id === a)
        )
          return true;
      }
      return false;
    });

  nodeGroups
    .selectAll<SVGCircleElement, GraphNode>(".node-circle")
    .attr("opacity", (d) => (connected.has(d.id) ? 1 : 0.35))
    .classed("active", (d) => d.id === id);
  nodeGroups
    .selectAll<SVGTextElement, GraphNode>(".node-label")
    .attr("opacity", (d) => (connected.has(d.id) ? 1 : 0.35))
    .classed("active", (d) => d.id === id);
}

function centerOnNode(id: number) {
  const node = nodes.find((n) => n.id === id);
  if (!node || !zoomBehavior || !svgSelection || !containerRef.value) return;
  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  const transform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(1.2)
    .translate(-node.x!, -node.y!);
  svgSelection
    .transition()
    .duration(600)
    .call(zoomBehavior.transform, transform);
}

// Watch for cluster filter
watch(activeCluster, (cluster) => {
  if (!linkElements || !nodeGroups) return;
  if (cluster === null) {
    updateHighlights();
    return;
  }
  nodeGroups
    .selectAll<SVGCircleElement, GraphNode>(".node-circle")
    .attr("opacity", (d) => (d.cluster === cluster ? 1 : 0.1));
  nodeGroups
    .selectAll<SVGTextElement, GraphNode>(".node-label")
    .attr("opacity", (d) => (d.cluster === cluster ? 1 : 0.1));
  linkElements.attr("opacity", (d) => {
    const s = d.source as GraphNode,
      t = d.target as GraphNode;
    return s.cluster === cluster || t.cluster === cluster ? 0.5 : 0.03;
  });
});

watch(currentId, (id) => {
  updateHighlights();
  if (id !== null) centerOnNode(id);
});

// Resize handler
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  initGraph();
  resizeObserver = new ResizeObserver(() => {
    if (!containerRef.value || !svgSelection || !simulation) return;
    const w = containerRef.value.clientWidth;
    const h = containerRef.value.clientHeight;
    svgSelection.attr("width", w).attr("height", h);
    simulation.force("center", d3.forceCenter(w / 2, h / 2));
    simulation.alpha(0.3).restart();
  });
  if (containerRef.value) resizeObserver.observe(containerRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  simulation?.stop();
});
</script>

<template>
  <div ref="containerRef" class="graph-wrapper">
    <svg ref="svgRef"></svg>
    <div class="graph-legend">
      <div
        v-for="c in [
          { id: 1, n: '計算×詩の交差' },
          { id: 2, n: 'チューリングの人物と思想' },
          { id: 3, n: 'チューリングマシンの構造' },
          { id: 4, n: '詩学の展開' },
          { id: 5, n: '記号操作の哲学' },
          { id: 6, n: 'Code Poetry・ウリポ・esolang' },
          { id: 7, n: '横断的プラトー' },
        ]"
        :key="c.id"
        class="legend-item"
      >
        <span
          class="legend-dot"
          :style="{ background: getClusterColor(c.id) }"
        ></span>
        <span>{{ c.n }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.graph-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}
.graph-wrapper svg {
  width: 100%;
  height: 100%;
}
</style>
