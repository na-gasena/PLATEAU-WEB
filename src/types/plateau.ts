/** A single plateau (article) in the network */
export interface Plateau {
  id: number
  title: string
  cluster: number
  clusterName: string
  linksTo: number[]
  linkedFrom: number[]
  body: string
}

/** A keyword extracted from plateau text, with occurrence info */
export interface Keyword {
  word: string
  /** plateau IDs where this word appears */
  plateauIds: number[]
  /** total occurrence count across all plateaus */
  count: number
}

/** Cluster color/name mapping */
export interface ClusterInfo {
  id: number
  name: string
  color: string
}

/** D3 node for the network graph */
export interface GraphNode extends d3.SimulationNodeDatum {
  id: number
  title: string
  cluster: number
  clusterName: string
  radius: number
}

/** D3 link for the network graph */
export interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: number | GraphNode
  target: number | GraphNode
}

/** D3 node for the word field */
export interface WordNode extends d3.SimulationNodeDatum {
  word: string
  count: number
  radius: number
  plateauIds: number[]
}

/** D3 link for the word field (co-occurrence) */
export interface WordLink extends d3.SimulationLinkDatum<WordNode> {
  source: string | WordNode
  target: string | WordNode
  weight: number
}
