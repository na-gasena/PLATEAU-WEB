import type { Plateau, ClusterInfo, Keyword } from '@/types/plateau'
import { PLATEAUS } from '@/data/plateaus'
import { KEYWORDS } from '@/data/keywords'
import { ref, computed, readonly } from 'vue'

// ---- Cluster definitions ----
export const CLUSTERS: ClusterInfo[] = [
  { id: 1, name: '計算×詩の交差', color: '#ff6b8a' },
  { id: 2, name: 'チューリングの人物と思想', color: '#ffa06c' },
  { id: 3, name: 'チューリングマシンの構造', color: '#6ce0ff' },
  { id: 4, name: '詩学の展開', color: '#a78bfa' },
  { id: 5, name: '記号操作の哲学', color: '#6cffc0' },
  { id: 6, name: 'Code Poetry・ウリポ・esolang', color: '#ffdb6c' },
  { id: 7, name: '横断的プラトー', color: '#ff8cf0' },
]

export const CLUSTER_COLOR_MAP: Record<number, string> = Object.fromEntries(
  CLUSTERS.map(c => [c.id, c.color])
)

// ---- Reactive state ----
const currentId = ref<number | null>(null)
const trail = ref<number[]>([])
const activeCluster = ref<number | null>(null)
const showWordField = ref(false)
const highlightWord = ref<string | null>(null)
const selectedKeyword = ref<string | null>(null)
const poemTrail = ref<string[]>([])

// ---- Computed ----
const currentPlateau = computed<Plateau | null>(() => {
  if (currentId.value === null) return null
  return PLATEAUS.find(p => p.id === currentId.value) ?? null
})

const currentKeywords = computed<Keyword[]>(() => {
  if (currentId.value === null) return []
  return KEYWORDS.filter(k => k.plateauIds.includes(currentId.value!))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40)
})

// ---- Actions ----
function navigateTo(id: number) {
  const p = PLATEAUS.find(p => p.id === id)
  if (!p) return

  currentId.value = id
  highlightWord.value = null
  selectedKeyword.value = null

  // Add to trail (no duplicates in sequence)
  if (trail.value[trail.value.length - 1] !== id) {
    trail.value.push(id)
    if (trail.value.length > 50) trail.value.shift()
  }
}

function navigateWithHighlight(id: number, word: string) {
  const p = PLATEAUS.find(p => p.id === id)
  if (!p) return

  currentId.value = id
  highlightWord.value = word
  selectedKeyword.value = null

  if (trail.value[trail.value.length - 1] !== id) {
    trail.value.push(id)
    if (trail.value.length > 50) trail.value.shift()
  }
}

function selectKeyword(word: string | null) {
  selectedKeyword.value = word
}

function addToPoemTrail(word: string) {
  poemTrail.value = [...poemTrail.value, word]
}

function clearPoemTrail() {
  poemTrail.value = []
}

function getKeywordSnippet(plateauId: number, word: string): string {
  const p = PLATEAUS.find(p => p.id === plateauId)
  if (!p) return ''
  const idx = p.body.indexOf(word)
  if (idx < 0) return ''
  const start = Math.max(0, idx - 30)
  const end = Math.min(p.body.length, idx + word.length + 40)
  return (start > 0 ? '…' : '') + p.body.substring(start, end).replace(/\n/g, ' ') + (end < p.body.length ? '…' : '')
}

function navigateRandom() {
  const randomId = Math.floor(Math.random() * PLATEAUS.length) + 1
  navigateTo(randomId)
}

function clearTrail() {
  trail.value = []
}

function setClusterFilter(cluster: number | null) {
  activeCluster.value = cluster
}

function toggleWordField() {
  showWordField.value = !showWordField.value
}

function getPlateauById(id: number): Plateau | undefined {
  return PLATEAUS.find(p => p.id === id)
}

function getClusterColor(cluster: number): string {
  return CLUSTER_COLOR_MAP[cluster] || '#ffffff'
}

function searchPlateaus(query: string): Plateau[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  return PLATEAUS.filter(p =>
    p.title.toLowerCase().includes(q) ||
    p.body.toLowerCase().includes(q)
  ).slice(0, 10)
}

// ---- Export composable ----
export function usePlateaus() {
  return {
    // Data
    plateaus: PLATEAUS,
    keywords: KEYWORDS,
    clusters: CLUSTERS,
    // State (readonly refs)
    currentId: readonly(currentId),
    currentPlateau,
    currentKeywords,
    trail: readonly(trail),
    activeCluster: readonly(activeCluster),
    showWordField,
    highlightWord: readonly(highlightWord),
    selectedKeyword: readonly(selectedKeyword),
    poemTrail: readonly(poemTrail),
    // Actions
    navigateTo,
    navigateWithHighlight,
    navigateRandom,
    clearTrail,
    setClusterFilter,
    toggleWordField,
    selectKeyword,
    addToPoemTrail,
    clearPoemTrail,
    getPlateauById,
    getClusterColor,
    getKeywordSnippet,
    searchPlateaus,
  }
}
