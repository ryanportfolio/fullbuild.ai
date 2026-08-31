/* The streamed venue's light-weight configuration and shared state, split from
 * `VenueTiles.tsx` so `LaylineScene` can import it without pulling
 * `3d-tiles-renderer` into the page bundle. The heavy module loads lazily and
 * only when `?venue=tiles` asks for it; everything here has no imports at all. */

/**
 * The one piece of state the quality governor and the streamed venue share.
 *
 * The governor lives in `LaylineScene`, walks the pixel ratio against measured
 * frame time, and until now had nothing to say about how much geometry the
 * scene was asking for. Over the streamed venue the pixel ratio is the smaller
 * lever: the tileset draws 430 to 510 times a frame at error target 12 and 182
 * at 30 (spike measurement), and draw calls are what this scene is short of.
 *
 * The contract between the two, stated so they cannot fight over one number:
 * the GOVERNOR owns the ceiling and only ever raises or lowers that, and
 * SETTLE-SHARPENING owns everything below it. The value actually written to the
 * tileset is `max(ceiling, whatever settle-sharpening asks for)`, so a relaxed
 * camera can be coarser than the ceiling but nothing can be sharper than it.
 */
export const tilesQuality = {
  /* True while a streamed venue is mounted; the governor stands down otherwise. */
  active: false,
  /* Whether the governor is allowed to walk the ceiling at all. Off is the
   * before arm of the interaction-frame-time A/B, nothing else. */
  governor: true,
  /* Coarsest screen-space error the governor is currently insisting on. */
  ceiling: 0,
  /* The sharp target the tier asked for, so the governor knows its floor. */
  target: 12,
  /* Frame-time miss threshold the governor works to; the scene writes it. */
  missMs: 22,
};

/* Rungs the governor walks the ceiling along, sharp first. 30 is where the
 * spike measured 182 draws against 470 at target 6, and it is the rung a phone
 * is expected to sit on. */
export const ERROR_LADDER = [18, 24, 30, 40];

/**
 * What this machine and this connection can afford, read once at mount.
 *
 * `navigator.connection` and `navigator.deviceMemory` are Chromium-only and
 * both are read defensively: Safari and Firefox report neither and land on the
 * middle tier, which is exactly the shape the spike measured and shipped.
 *
 * This does NOT touch the pixel-ratio governor. That walks the render
 * resolution against measured frame time and is a closed loop; this sets how
 * much geometry the tileset is asked for in the first place, once, and the two
 * do not read or write each other's state.
 */
export interface TilesTier {
  name: "lean" | "base" | "fast";
  errorTarget: number;
  downloadJobs: number;
  parseJobs: number;
  lruMax: number;
  /* What the tier was decided from, so a capture can report it. */
  downlink: number | null;
  effectiveType: string | null;
  deviceMemory: number | null;
  saveData: boolean;
}

interface NetworkInformation {
  downlink?: number;
  effectiveType?: string;
  saveData?: boolean;
}

/* The tiers, as one table so the report can quote it and a capture can force a
 * row without lying about what the machine said. */
export const TIER_TABLE = {
  lean: { errorTarget: 30, downloadJobs: 12, parseJobs: 3, lruMax: 3000 },
  base: { errorTarget: 12, downloadJobs: 25, parseJobs: 5, lruMax: 8000 },
  fast: { errorTarget: 10, downloadJobs: 48, parseJobs: 10, lruMax: 12000 },
} as const;

export function readTilesTier(): TilesTier {
  const nav =
    typeof navigator === "undefined"
      ? null
      : (navigator as Navigator & { connection?: NetworkInformation; deviceMemory?: number });
  const connection = nav?.connection ?? null;
  const downlink = typeof connection?.downlink === "number" ? connection.downlink : null;
  const effectiveType = typeof connection?.effectiveType === "string" ? connection.effectiveType : null;
  const deviceMemory = typeof nav?.deviceMemory === "number" ? nav.deviceMemory : null;
  const saveData = connection?.saveData === true;
  const base: Omit<TilesTier, "name" | "errorTarget" | "downloadJobs" | "parseJobs" | "lruMax"> = {
    downlink,
    effectiveType,
    deviceMemory,
    saveData,
  };
  /* Lean first, because the cost of guessing fast on a phone is a scene that
   * never settles. `saveData` is the visitor asking outright. */
  const slowLink = effectiveType === "slow-2g" || effectiveType === "2g" || effectiveType === "3g";
  if (saveData || slowLink || (deviceMemory !== null && deviceMemory <= 4)) {
    return { name: "lean", ...TIER_TABLE.lean, ...base };
  }
  if (downlink !== null && downlink >= 10 && deviceMemory !== null && deviceMemory >= 8) {
    return { name: "fast", ...TIER_TABLE.fast, ...base };
  }
  return { name: "base", ...TIER_TABLE.base, ...base };
}
