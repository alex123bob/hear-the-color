// Decides when a new description is worth asking for, so a still scene isn't described over and over.

// Mean RGB difference (0-1, see frameDifference) at or above which the scene counts as changed
export const CHANGE_THRESHOLD = 0.04
// Describe anyway after this long without a description, so the app never goes silent for good
export const FORCE_REFRESH_MS = 45000

export function shouldDescribe(diff: number, msSinceLastDescription: number): boolean {
  return diff >= CHANGE_THRESHOLD || msSinceLastDescription >= FORCE_REFRESH_MS
}

// Where in the view the scene changed, from per-zone differences: one zone, or 'wide' when several changed
export type ChangedZone = 'left' | 'center' | 'right' | 'wide'

export function maxZoneDifference(d: { left: number; center: number; right: number }): number {
  return Math.max(d.left, d.center, d.right)
}

export function changedZone(d: { left: number; center: number; right: number }): ChangedZone | null {
  const hit = (['left', 'center', 'right'] as const).filter((z) => d[z] >= CHANGE_THRESHOLD)
  if (hit.length === 0) return null
  return hit.length === 1 ? hit[0] : 'wide'
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

// The backend allows 20 requests a minute per IP; never ask more often than one per 3 s
export const MIN_REQUEST_GAP_MS = 3000

// How long to wait before the next /api/see call, given when the last one was sent
export function msUntilNextRequest(lastRequestAt: number, now: number): number {
  return Math.max(0, MIN_REQUEST_GAP_MS - (now - lastRequestAt))
}

export function isForcedRefresh(msSinceLastDescription: number): boolean {
  return msSinceLastDescription >= FORCE_REFRESH_MS
}

// What the listener knows about the scene, sent as `previous`. A change sentence is only a delta, so it is
// appended to the earlier knowledge (the newest 300 characters, the backend's limit) instead of replacing it;
// otherwise the model forgets the static objects and reports them as new again.
const MAX_SCENE_CHARS = 300

export function updateScene(scene: string, reply: Reply): string {
  const next = reply.changed === true && scene ? `${scene} ${reply.text}` : reply.text
  return next.slice(-MAX_SCENE_CHARS)
}
