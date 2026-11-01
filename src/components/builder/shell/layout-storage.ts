/*
 * Panel-size + chrome persistence for the ExpoForge builder shell.
 * Ported from open-pencil (https://github.com/open-pencil/open-pencil) — MIT License.
 * Source: src/app/shell/layout-storage.ts + src/components/editor/EditorWorkspace.vue
 * (loadEditorLayout / saveResizedLayout / LAYOUT_TOLERANCE pattern), adapted to persist the
 * UI-hidden flag alongside the panel sizes under a single versioned key.
 */

/** localStorage key for the persisted builder shell layout (panel sizes + UI-hidden flag). */
const LAYOUT_STORAGE_KEY = 'expoforge.layout.v1'

/** [left, canvas, right] panel shares of the window, in percent. */
export type PanelSizes = [number, number, number]

export interface BuilderLayout {
  sizes: PanelSizes
  /** Whether `$mod+\` hid the top bar and panels the last time the builder was used. */
  uiHidden: boolean
}

/** Default split: 20% / 60% / 20% (docs/03-design.md §2.2, EditorWorkspace.vue defaults). */
export const DEFAULT_PANEL_SIZES: PanelSizes = [20, 60, 20]

/** Side panels live between 10% and 30% of the window; the canvas keeps at least 30%. */
export const PANEL_LIMITS = { sideMin: 10, sideMax: 30, canvasMin: 30 } as const

/**
 * How far apart two sizes, in percent, still count as one; the splitter rounds finer than we
 * store, so the opening layout report that matches the loaded layout is not re-saved
 * (open-pencil EditorWorkspace.vue: `LAYOUT_TOLERANCE = 1e-6`).
 */
export const LAYOUT_TOLERANCE = 1e-6

function isValidSizes(value: unknown): value is PanelSizes {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (size) => typeof size === 'number' && Number.isFinite(size) && size > 0 && size <= 100
    )
  )
}

function clampSizes(sizes: PanelSizes): PanelSizes {
  return sizes.map((size) => Math.min(100, Math.max(1, size))) as PanelSizes
}

/**
 * Reads the persisted layout. Invalid JSON, a missing record, or a malformed shape all fall
 * back to the defaults — the builder must always open with a usable layout.
 */
export function loadBuilderLayout(): BuilderLayout {
  const fallback: BuilderLayout = { sizes: DEFAULT_PANEL_SIZES, uiHidden: false }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return fallback
    const record = parsed as { sizes?: unknown; uiHidden?: unknown }
    return {
      sizes: isValidSizes(record.sizes) ? clampSizes(record.sizes) : DEFAULT_PANEL_SIZES,
      uiHidden: record.uiHidden === true
    }
  } catch {
    return fallback
  }
}

function writeLayout(layout: BuilderLayout): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
  } catch {
    // Storage may be unavailable (private mode, quota); the layout just won't persist.
  }
}

/** Persists panel sizes, keeping the stored UI-hidden flag. */
export function savePanelSizes(sizes: PanelSizes): void {
  writeLayout({ sizes, uiHidden: loadBuilderLayout().uiHidden })
}

/** Persists the UI-hidden flag, keeping the stored panel sizes. */
export function saveUIHidden(uiHidden: boolean): void {
  writeLayout({ sizes: loadBuilderLayout().sizes, uiHidden })
}

/** True when both layouts are equal within {@link LAYOUT_TOLERANCE} on every panel. */
export function sameLayout(a: PanelSizes, b: PanelSizes): boolean {
  return a.every((size, index) => Math.abs(size - b[index]) < LAYOUT_TOLERANCE)
}
