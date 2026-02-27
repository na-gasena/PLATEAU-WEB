import { MARKOV_TABLE, STARTERS } from '@/data/markov'
import { TOKEN_INDEX } from '@/data/tokenIndex'

/**
 * Markov chain text generator for poem composition.
 * Uses transition table built from 35 plateau texts (kuromoji tokenized).
 * Token index provides full content word → plateau mapping (2000+ words).
 *
 * §9 テープの上の詩 — マルコフ連鎖とバロウズのカットアップ
 * §19 マラルメの宇宙 — 骰子の一振りと偶然の計算
 */

/** Pick next token using weighted random selection */
function weightedRandom(transitions: [string, number][]): string {
  const total = transitions.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * total
  for (const [token, weight] of transitions) {
    r -= weight
    if (r <= 0) return token
  }
  return transitions[0][0]
}

/** Find a starter token that contains or is close to the seed word */
function findSeed(seedWord: string): string {
  if (MARKOV_TABLE[seedWord]) return seedWord
  const containing = Object.keys(MARKOV_TABLE).filter(t => t.includes(seedWord))
  if (containing.length > 0) return containing[Math.floor(Math.random() * containing.length)]
  const starterMatch = STARTERS.filter(s => s.includes(seedWord))
  if (starterMatch.length > 0) return starterMatch[Math.floor(Math.random() * starterMatch.length)]
  return STARTERS[Math.floor(Math.random() * STARTERS.length)]
}

export interface PoemToken {
  text: string
  isKeyword: boolean
  /** The previous token that led to this one via Markov transition */
  prevToken: string | null
  /** This token's probability given prevToken (0-1) */
  probability: number
}

export interface PoemLine {
  tokens: PoemToken[]
}

/** Alternative candidate for a token position */
export interface TokenAlternative {
  text: string
  probability: number
  isKeyword: boolean
  isSelected: boolean
}

/** Get alternatives for a token at a given position (based on its prevToken) */
export function getAlternatives(prevToken: string | null): TokenAlternative[] {
  if (prevToken === null) {
    // First token — show starters as alternatives
    // Pick a subset of starters (up to 12) to keep the list manageable
    const subset = STARTERS.slice(0, 12)
    return subset.map(text => ({
      text,
      probability: 1 / subset.length,
      isKeyword: findKeywordInToken(text) !== null,
      isSelected: false,
    }))
  }

  const transitions = MARKOV_TABLE[prevToken]
  if (!transitions || transitions.length === 0) {
    // prevToken exists but has no transitions — try partial match
    const partialKey = Object.keys(MARKOV_TABLE).find(k => k.includes(prevToken) || prevToken.includes(k))
    if (!partialKey) return []
    const fallback = MARKOV_TABLE[partialKey]
    const total = fallback.reduce((s, [, w]) => s + w, 0)
    return fallback.map(([text, weight]) => ({
      text,
      probability: weight / total,
      isKeyword: findKeywordInToken(text) !== null,
      isSelected: false,
    }))
  }

  const total = transitions.reduce((s, [, w]) => s + w, 0)
  return transitions.map(([text, weight]) => ({
    text,
    probability: weight / total,
    isKeyword: findKeywordInToken(text) !== null,
    isSelected: false,
  }))
}

/** Generate a poem from a seed keyword */
export function generatePoem(seedWord: string, lines: number = 3, maxTokensPerLine: number = 8): PoemLine[] {
  const poem: PoemLine[] = []

  for (let l = 0; l < lines; l++) {
    const start = findSeed(seedWord)
    const tokens: PoemToken[] = []
    let current = start
    let prev: string | null = null

    for (let t = 0; t < maxTokensPerLine; t++) {
      // Compute probability of this token
      let prob = 1.0
      if (prev && MARKOV_TABLE[prev]) {
        const transitions = MARKOV_TABLE[prev]
        const total = transitions.reduce((s, [, w]) => s + w, 0)
        const entry = transitions.find(([tok]) => tok === current)
        prob = entry ? entry[1] / total : 0
      }

      tokens.push({
        text: current,
        isKeyword: findKeywordInToken(current) !== null,
        prevToken: prev,
        probability: prob,
      })

      // Get next token
      const next = MARKOV_TABLE[current]
      if (!next || next.length === 0) break

      prev = current
      current = weightedRandom(next)

      // End line at natural break points
      if (current.endsWith('。') || current.endsWith('、') || current.endsWith('——')) {
        const transitions = MARKOV_TABLE[prev!]
        const total = transitions ? transitions.reduce((s, [, w]) => s + w, 0) : 1
        const entry = transitions?.find(([tok]) => tok === current)
        tokens.push({
          text: current,
          isKeyword: findKeywordInToken(current) !== null,
          prevToken: prev,
          probability: entry ? entry[1] / total : 0,
        })
        break
      }
    }

    if (tokens.length > 0) poem.push({ tokens })
  }

  return poem
}

/** Find a content word in a token text using the full token index (2000+ words) */
function findKeywordInToken(text: string): string | null {
  // 1. Direct match — the token itself is indexed
  if (TOKEN_INDEX[text]) return text

  // 2. Search for the longest indexed word contained in the token
  //    (handles tokens with particles attached, e.g. "計算は")
  let best: string | null = null
  const keys = Object.keys(TOKEN_INDEX)
  for (const kw of keys) {
    if (kw.length < 2) continue
    if (!text.includes(kw)) continue
    if (!best || kw.length > best.length) best = kw
  }
  return best
}

/** Get the keyword contained in a token, for click handling */
export function getKeywordFromToken(text: string): string | null {
  return findKeywordInToken(text)
}

/** Get plateau IDs where a word appears */
export function getPlateauIdsForToken(word: string): number[] {
  return TOKEN_INDEX[word] || []
}

/** Composable export */
export function useMarkov() {
  return {
    generatePoem,
    getKeywordFromToken,
    getAlternatives,
    getPlateauIdsForToken,
  }
}
