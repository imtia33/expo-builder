/*
 * Paint values — the color model behind every color field (Phase 1, Figma-like
 * fills): a color field can hold
 *
 *   1. a SOLID string   '#rrggbb' | '#rrggbbaa' | '#fff'  (backward compatible —
 *      every existing project keeps working untouched),
 *   2. a GRADIENT       { type: 'linear-gradient' | 'radial-gradient', … } with
 *      draggable stops (Figma semantics), rendered in the preview via RNW's
 *      CSS `backgroundImage` and emitted by codegen as an
 *      expo-linear-gradient <LinearGradient> wrapper,
 *   3. a THEME TOKEN     { token: 'primary' } bound to the project palette —
 *      resolved live in the preview and emitted as `colors.primary` against a
 *      generated plain-TS `constants/theme.ts` (the TravelMate / Expo default
 *      template pattern: light/dark maps + a tiny useTheme hook, NO
 *      NativeWind/uniwind dependency).
 *
 * Pure module: no React, no store — trivially unit-testable, shared by the
 * color picker UI, the preview resolver and the code generator.
 */

/* ── types ──────────────────────────────────────────────────────────────── */

export interface GradientStop {
  /** Solid hex color ('#rrggbb' or '#rrggbbaa'). */
  color: string
  /** Stop position, 0–1. */
  position: number
}

export interface LinearGradientPaint {
  type: 'linear-gradient'
  /** Builder angle convention (locked with the lineargradient entry): 0° = left→right, 90° = top→bottom. */
  angle: number
  stops: GradientStop[]
}

export interface RadialGradientPaint {
  type: 'radial-gradient'
  stops: GradientStop[]
}

export type GradientPaint = LinearGradientPaint | RadialGradientPaint

export interface TokenPaint {
  token: string
}

export type PaintValue = string | GradientPaint | TokenPaint

/* ── type guards & normalization ────────────────────────────────────────── */

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isSolidPaint(v: unknown): v is string {
  return typeof v === 'string' && (v === '' || HEX_RE.test(v))
}

export function isGradientPaint(v: unknown): v is GradientPaint {
  if (!v || typeof v !== 'object') return false
  const g = v as GradientPaint
  return (g.type === 'linear-gradient' || g.type === 'radial-gradient') && Array.isArray(g.stops) && g.stops.length >= 2
}

export function isTokenPaint(v: unknown): v is TokenPaint {
  if (!v || typeof v !== 'object') return false
  const t = v as TokenPaint
  return typeof t.token === 'string' && t.token.length > 0
}

export function isPaintValue(v: unknown): v is PaintValue {
  return isSolidPaint(v) || isGradientPaint(v) || isTokenPaint(v)
}

/** Clamp + sort stops, cap at 10 (picker mirrors the cap); keeps ≥ 2. */
export function normalizeStops(stops: GradientStop[]): GradientStop[] {
  const cleaned = stops
    .filter((s) => s && typeof s.color === 'string' && typeof s.position === 'number')
    .map((s) => ({ color: s.color, position: Math.min(1, Math.max(0, s.position)) }))
    .sort((a, b) => a.position - b.position)
    .slice(0, 10)
  if (cleaned.length >= 2) {
    // Pin the ends so the gradient always spans the full axis (Figma behavior).
    cleaned[0] = { ...cleaned[0], position: 0 }
    cleaned[cleaned.length - 1] = { ...cleaned[cleaned.length - 1], position: 1 }
    return cleaned
  }
  return [
    { color: '#A855F7', position: 0 },
    { color: '#EC4899', position: 1 }
  ]
}

export function normalizeGradient(g: GradientPaint): GradientPaint {
  const stops = normalizeStops(g.stops)
  if (g.type === 'linear-gradient') {
    const raw = Number(g.angle)
    return { type: 'linear-gradient', angle: Number.isFinite(raw) ? ((Math.round(raw) % 360) + 360) % 360 : 45, stops }
  }
  return { type: 'radial-gradient', stops }
}

/** Coerce an arbitrary stored value into a valid PaintValue (or null). */
export function coercePaint(v: unknown): PaintValue | null {
  if (isSolidPaint(v) || isTokenPaint(v)) return v
  if (isGradientPaint(v)) return normalizeGradient(v)
  return null
}

/* ── CSS conversion (RNW preview) ───────────────────────────────────────── */

/**
 * Builder angle → CSS angle. Builder: 0° = left→right, 90° = top→bottom.
 * CSS linear-gradient: 0deg = bottom→top, 90deg = left→right → css = builder + 90.
 */
function cssAngle(builderAngle: number): number {
  return (builderAngle + 90) % 360
}

function stopsCss(g: GradientPaint): string {
  return normalizeStops(g.stops)
    .map((s) => `${s.color} ${Math.round(s.position * 1000) / 10}%`)
    .join(', ')
}

/** CSS background for a gradient paint (RNW supports backgroundImage). */
export function gradientCss(g: GradientPaint): string {
  const n = normalizeGradient(g)
  if (n.type === 'linear-gradient') return `linear-gradient(${cssAngle(n.angle)}deg, ${stopsCss(n)})`
  return `radial-gradient(circle, ${stopsCss(n)})`
}

/* ── style-key resolution ───────────────────────────────────────────────── */

/** Node style keys that hold paint values (kept in sync with the codegen style order). */
export const COLOR_STYLE_KEYS: readonly string[] = [
  'backgroundColor',
  'color',
  'borderColor',
  'shadowColor',
  'tintColor'
]

/** Only container fills can be gradients in RN (backgrounds, not text/border/shadow). */
export const GRADIENT_STYLE_KEYS: ReadonlySet<string> = new Set(['backgroundColor'])

/** Resolve a theme token name to a color string for the given mode; null when unknown. */
export type TokenResolver = (token: string, mode: 'light' | 'dark') => string | null

/**
 * Convert one paint value into preview style keys.
 *  - solid → { backgroundColor }
 *  - token → resolved via the resolver → { backgroundColor } (null resolution = ignored)
 *  - gradient → { backgroundImage } (CSS; RNW renders it exactly like the browser)
 */
export function paintToPreviewStyles(
  paint: PaintValue,
  resolveToken: TokenResolver,
  mode: 'light' | 'dark'
): Record<string, string> {
  if (isSolidPaint(paint)) return paint === '' ? {} : { backgroundColor: paint }
  if (isTokenPaint(paint)) {
    const resolved = resolveToken(paint.token, mode)
    return resolved ? { backgroundColor: resolved } : {}
  }
  return { backgroundImage: gradientCss(paint) }
}

/**
 * Map every color key of a resolved style record into preview-renderable keys
 * (tokens resolved, gradients moved to backgroundImage). Returns a NEW object;
 * unknown values pass through untouched.
 */
export function applyPaints(
  style: Record<string, unknown>,
  resolveToken: TokenResolver,
  mode: 'light' | 'dark',
  /** False on components whose RN element cannot host a gradient background
   *  (Text/TextInput/Button/…) — gradients degrade to the first stop color so
   *  the preview and generated code can never drift. */
  allowGradient = true
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  let changed = false
  for (const key of Object.keys(style)) {
    const value = style[key]
    if (!COLOR_STYLE_KEYS.includes(key) || value === undefined || value === null) {
      out[key] = value
      continue
    }
    if (isSolidPaint(value)) {
      out[key] = value
      continue
    }
    if (isTokenPaint(value)) {
      const resolved = resolveToken(value.token, mode)
      if (resolved) out[key] = resolved
      else delete out[key]
      changed = true
      continue
    }
    if (isGradientPaint(value)) {
      if (GRADIENT_STYLE_KEYS.has(key) && allowGradient) {
        // Gradients only exist as element backgrounds: the preview layer turns
        // backgroundImage into a CSS gradient on the same element.
        out.backgroundImage = gradientCss(value)
        delete out[key]
      } else {
        // Not representable on this key (e.g. text color) → first stop's color.
        const stops = normalizeStops(value.stops)
        out[key] = stops[0].color
      }
      changed = true
      continue
    }
    out[key] = value
  }
  return changed ? out : style
}

/* ── display helpers (picker / field row) ───────────────────────────────── */

/** Short label for the field row: token name, hex, or 'Linear/Radial gradient'. */
export function paintLabel(v: unknown): string {
  if (isTokenPaint(v)) return `{${v.token}}`
  if (isGradientPaint(v)) return v.type === 'linear-gradient' ? `Linear gradient` : `Radial gradient`
  if (isSolidPaint(v)) return v === '' ? 'None' : v.toUpperCase()
  return 'None'
}

/**
 * Swatch preview CSS for the field row's chip: solid color, resolved token, or
 * the gradient itself (null → checkerboard "none").
 */
export function paintSwatchBackground(v: unknown, resolveToken: TokenResolver, mode: 'light' | 'dark'): string | null {
  if (v === undefined || v === null || v === '') return null
  if (isSolidPaint(v)) return v
  if (isTokenPaint(v)) return resolveToken(v.token, mode)
  if (isGradientPaint(v)) return gradientCss(v)
  return null
}

/* ── default palette (seed for new + migrated projects) ─────────────────── */

export interface ThemeTokenColor {
  light: string
  dark: string
}

export type ThemePalette = Record<string, ThemeTokenColor>

/**
 * Default project tokens — names mirror the reference apps' plain-TS themes
 * (TravelMate `constants/theme.js`, Expo's default template), so generated
 * `constants/theme.ts` looks exactly like hand-written project code.
 */
export const DEFAULT_THEME_COLORS: ThemePalette = {
  background: { light: '#FFFFFF', dark: '#09090B' },
  card: { light: '#FFFFFF', dark: '#1E1E1E' },
  text: { light: '#111827', dark: '#F5F5F5' },
  textSecondary: { light: '#7B7B8B', dark: '#A1A1AA' },
  border: { light: '#E5E5E5', dark: '#27272A' },
  primary: { light: '#2563EB', dark: '#3B82F6' },
  primaryLight: { light: '#DBEAFE', dark: '#1E3A8A' },
  secondary: { light: '#F3F4F6', dark: '#27272A' },
  accent: { light: '#FF6B35', dark: '#FF6B35' },
  success: { light: '#16A34A', dark: '#4ADE80' },
  warning: { light: '#F59E0B', dark: '#FBBF24' },
  error: { light: '#DC2626', dark: '#F87171' }
}

/** Token resolver over a palette (missing token → null). */
export function paletteResolver(palette: ThemePalette | undefined): TokenResolver {
  return (token, mode) => palette?.[token]?.[mode] ?? null
}

/** Figma-style starter gradients offered in the picker's gradient tab. */
export const STARTER_GRADIENTS: GradientPaint[] = [
  { type: 'linear-gradient', angle: 45, stops: [ { color: '#A855F7', position: 0 }, { color: '#EC4899', position: 1 } ] },
  { type: 'linear-gradient', angle: 90, stops: [ { color: '#2563EB', position: 0 }, { color: '#06B6D4', position: 1 } ] },
  { type: 'linear-gradient', angle: 180, stops: [ { color: '#F59E0B', position: 0 }, { color: '#EF4444', position: 1 } ] },
  { type: 'linear-gradient', angle: 0, stops: [ { color: '#10B981', position: 0 }, { color: '#84CC16', position: 1 } ] },
  { type: 'radial-gradient', stops: [ { color: '#FDE68A', position: 0 }, { color: '#F97316', position: 1 } ] }
]
