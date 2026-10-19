// Decides when a new description is worth asking for, so a still scene isn't described over and over.

// Mean RGB difference (0-1, see frameDifference) at or above which the scene counts as changed
export const CHANGE_THRESHOLD = 0.04
// Describe anyway after this long without a description, so the app never goes silent for good
export const FORCE_REFRESH_MS = 45000

export function shouldDescribe(diff: number, msSinceLastDescription: number): boolean {
  return diff >= CHANGE_THRESHOLD || msSinceLastDescription >= FORCE_REFRESH_MS
}

// A /api/see reply. `changed` is only present when we sent `previous`; an older backend never sends it
export interface Reply {
  text: string
  changed?: boolean
}

// Only a reply the backend flagged as unchanged stays silent
export function isSpeakable(r: Reply): boolean {
  return r.changed !== false
}
