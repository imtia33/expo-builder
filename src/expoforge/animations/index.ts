/*
 * Animation catalog — the single source of truth for visual animation editing.
 *
 * Three consumers, one catalog (no drift possible):
 *  - right-panel Animation section  → preset/easing pickers, capability gating
 *  - canvas preview                 → WAAPI keyframes approximating the preset
 *  - lib/codegen                    → real react-native-reanimated builders
 *
 * Everything here mirrors the PUBLIC reanimated layout-animation API
 * (verified against docs.swmansion.com — Entering/Exiting animations):
 *   builders:  FadeIn/Out, SlideIn/Out{Down,Up,Left,Right}, ZoomIn/Out(+dirs),
 *              BounceIn/Out(+dirs), FlipIn/Out{EasyX,EasyY,XDown,XUp,YLeft,YRight},
 *              StretchIn/Out{X,Y}, RollIn/Out{Left,Right},
 *              LightSpeedIn/Out{Left,Right}, PinwheelIn/Out
 *   modifiers: .duration(ms) .delay(ms) .easing(fn) .springify() .damping(n)
 *              .stiffness(n) .mass(n) .overshootClamping(bool)
 * Easing functions come from reanimated's own `Easing` export.
 */

import type { AnimationSpec, EasingKind } from '@/lib/project/types'

/* ────────────────────────────────────────────────────────────────────────────
 * Presets
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AnimationPresetDef {
  /** Stable id stored in AnimationSpec.preset ('fade-in', 'slide-in-up', …). */
  id: string
  /** Inspector label. */
  label: string
  /** Visual family for grouped pickers. */
  group: 'Fade' | 'Slide' | 'Zoom' | 'Bounce' | 'Flip' | 'Stretch' | 'Roll' | 'Light speed' | 'Pinwheel'
  /** reanimated builder class actually emitted into generated code. */
  reanimated: string
  /**
   * WAAPI keyframes for the canvas preview. `offset` omitted (evenly spaced).
   * Keyframe values are plain CSS (transform strings / opacity numbers).
   */
  preview: Array<Record<string, string | number>>
}

const fade = (dir: string, from: Record<string, string | number>): AnimationPresetDef => ({
  id: `fade-in${dir ? `-${dir}` : ''}`,
  label: `Fade in${dir ? ` ${dir}` : ''}`,
  group: 'Fade',
  reanimated: `FadeIn${dir === '' ? '' : dir.charAt(0).toUpperCase() + dir.slice(1)}`,
  preview: [from, { opacity: 1, transform: 'none' }]
})

const fadeOut = (dir: string, to: Record<string, string | number>): AnimationPresetDef => ({
  id: `fade-out${dir ? `-${dir}` : ''}`,
  label: `Fade out${dir ? ` ${dir}` : ''}`,
  group: 'Fade',
  reanimated: `FadeOut${dir === '' ? '' : dir.charAt(0).toUpperCase() + dir.slice(1)}`,
  preview: [{ opacity: 1, transform: 'none' }, to]
})

const slideIn = (dir: 'down' | 'up' | 'left' | 'right', transform: string): AnimationPresetDef => ({
  id: `slide-in-${dir}`,
  label: `Slide in ${dir}`,
  group: 'Slide',
  reanimated: `SlideIn${cap(dir)}`,
  preview: [{ opacity: 0, transform }, { opacity: 1, transform: 'none' }]
})

const slideOut = (dir: 'down' | 'up' | 'left' | 'right', transform: string): AnimationPresetDef => ({
  id: `slide-out-${dir}`,
  label: `Slide out ${dir}`,
  group: 'Slide',
  reanimated: `SlideOut${cap(dir)}`,
  preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform }]
})

const zoomIn = (suffix: string, from: Record<string, string | number>): AnimationPresetDef => ({
  id: `zoom-in${suffix ? `-${suffix}` : ''}`,
  label: `Zoom in${suffix ? ` ${suffix}` : ''}`,
  group: 'Zoom',
  reanimated: `ZoomIn${cap(suffix)}`,
  preview: [{ opacity: 0.2, ...from }, { opacity: 1, transform: 'none' }]
})

const zoomOut = (suffix: string, to: Record<string, string | number>): AnimationPresetDef => ({
  id: `zoom-out${suffix ? `-${suffix}` : ''}`,
  label: `Zoom out${suffix ? ` ${suffix}` : ''}`,
  group: 'Zoom',
  reanimated: `ZoomOut${cap(suffix)}`,
  preview: [{ opacity: 1, transform: 'none' }, { opacity: 0.2, ...to }]
})

function cap(s: string): string {
  return s === '' ? '' : s.charAt(0).toUpperCase() + s.slice(1)
}

export const ENTERING_PRESETS: AnimationPresetDef[] = [
  fade('', { opacity: 0 }),
  fade('down', { opacity: 0, transform: 'translateY(24px)' }),
  fade('up', { opacity: 0, transform: 'translateY(-24px)' }),
  fade('left', { opacity: 0, transform: 'translateX(24px)' }),
  fade('right', { opacity: 0, transform: 'translateX(-24px)' }),
  slideIn('down', 'translateY(48px)'),
  slideIn('up', 'translateY(-48px)'),
  slideIn('left', 'translateX(96px)'),
  slideIn('right', 'translateX(-96px)'),
  zoomIn('', { transform: 'scale(0.8)' }),
  zoomIn('down', { transform: 'scale(0.6) translateY(48px)' }),
  zoomIn('up', { transform: 'scale(0.6) translateY(-48px)' }),
  zoomIn('left', { transform: 'scale(0.6) translateX(96px)' }),
  zoomIn('right', { transform: 'scale(0.6) translateX(-96px)' }),
  {
    id: 'bounce-in',
    label: 'Bounce in',
    group: 'Bounce',
    reanimated: 'BounceIn',
    preview: [
      { opacity: 0, transform: 'scale(0.4)' },
      { opacity: 1, transform: 'scale(1.15)', easing: 'cubic-bezier(0.2, 0, 0.4, 1)' },
      { opacity: 1, transform: 'scale(0.95)' },
      { opacity: 1, transform: 'none' }
    ]
  },
  {
    id: 'bounce-in-down',
    label: 'Bounce in down',
    group: 'Bounce',
    reanimated: 'BounceInDown',
    preview: [
      { opacity: 0, transform: 'translateY(-64px)' },
      { opacity: 1, transform: 'translateY(12px)' },
      { opacity: 1, transform: 'translateY(-6px)' },
      { opacity: 1, transform: 'none' }
    ]
  },
  {
    id: 'flip-in-x',
    label: 'Flip in X',
    group: 'Flip',
    reanimated: 'FlipInEasyX',
    preview: [{ opacity: 0, transform: 'perspective(400px) rotateX(80deg)' }, { opacity: 1, transform: 'none' }]
  },
  {
    id: 'flip-in-y',
    label: 'Flip in Y',
    group: 'Flip',
    reanimated: 'FlipInEasyY',
    preview: [{ opacity: 0, transform: 'perspective(400px) rotateY(80deg)' }, { opacity: 1, transform: 'none' }]
  },
  {
    id: 'stretch-in-x',
    label: 'Stretch in X',
    group: 'Stretch',
    reanimated: 'StretchInX',
    preview: [{ opacity: 0, transform: 'scaleX(0.2)' }, { opacity: 1, transform: 'none' }]
  },
  {
    id: 'stretch-in-y',
    label: 'Stretch in Y',
    group: 'Stretch',
    reanimated: 'StretchInY',
    preview: [{ opacity: 0, transform: 'scaleY(0.2)' }, { opacity: 1, transform: 'none' }]
  },
  {
    id: 'roll-in-left',
    label: 'Roll in left',
    group: 'Roll',
    reanimated: 'RollInLeft',
    preview: [{ opacity: 0, transform: 'translateX(-96px) rotate(-180deg)' }, { opacity: 1, transform: 'none' }]
  },
  {
    id: 'roll-in-right',
    label: 'Roll in right',
    group: 'Roll',
    reanimated: 'RollInRight',
    preview: [{ opacity: 0, transform: 'translateX(96px) rotate(180deg)' }, { opacity: 1, transform: 'none' }]
  },
  {
    id: 'light-speed-in-left',
    label: 'Light speed in left',
    group: 'Light speed',
    reanimated: 'LightSpeedInLeft',
    preview: [
      { opacity: 0, transform: 'translateX(-96px) skewX(-12deg)' },
      { opacity: 1, transform: 'none' }
    ]
  },
  {
    id: 'light-speed-in-right',
    label: 'Light speed in right',
    group: 'Light speed',
    reanimated: 'LightSpeedInRight',
    preview: [
      { opacity: 0, transform: 'translateX(96px) skewX(12deg)' },
      { opacity: 1, transform: 'none' }
    ]
  }
]

export const EXITING_PRESETS: AnimationPresetDef[] = [
  fadeOut('', { opacity: 0 }),
  fadeOut('down', { opacity: 0, transform: 'translateY(24px)' }),
  fadeOut('up', { opacity: 0, transform: 'translateY(-24px)' }),
  fadeOut('left', { opacity: 0, transform: 'translateX(24px)' }),
  fadeOut('right', { opacity: 0, transform: 'translateX(-24px)' }),
  slideOut('down', 'translateY(48px)'),
  slideOut('up', 'translateY(-48px)'),
  slideOut('left', 'translateX(96px)'),
  slideOut('right', 'translateX(-96px)'),
  zoomOut('', { transform: 'scale(0.8)' }),
  zoomOut('down', { transform: 'scale(0.6) translateY(48px)' }),
  zoomOut('up', { transform: 'scale(0.6) translateY(-48px)' }),
  {
    id: 'bounce-out',
    label: 'Bounce out',
    group: 'Bounce',
    reanimated: 'BounceOut',
    preview: [
      { opacity: 1, transform: 'none' },
      { opacity: 1, transform: 'scale(1.15)' },
      { opacity: 0, transform: 'scale(0.4)' }
    ]
  },
  {
    id: 'flip-out-x',
    label: 'Flip out X',
    group: 'Flip',
    reanimated: 'FlipOutEasyX',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'perspective(400px) rotateX(-80deg)' }]
  },
  {
    id: 'flip-out-y',
    label: 'Flip out Y',
    group: 'Flip',
    reanimated: 'FlipOutEasyY',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'perspective(400px) rotateY(-80deg)' }]
  },
  {
    id: 'stretch-out-x',
    label: 'Stretch out X',
    group: 'Stretch',
    reanimated: 'StretchOutX',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scaleX(0.2)' }]
  },
  {
    id: 'stretch-out-y',
    label: 'Stretch out Y',
    group: 'Stretch',
    reanimated: 'StretchOutY',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scaleY(0.2)' }]
  },
  {
    id: 'roll-out-left',
    label: 'Roll out left',
    group: 'Roll',
    reanimated: 'RollOutLeft',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-96px) rotate(180deg)' }]
  },
  {
    id: 'roll-out-right',
    label: 'Roll out right',
    group: 'Roll',
    reanimated: 'RollOutRight',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(96px) rotate(-180deg)' }]
  },
  {
    id: 'light-speed-out-left',
    label: 'Light speed out left',
    group: 'Light speed',
    reanimated: 'LightSpeedOutLeft',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(-96px) skewX(12deg)' }]
  },
  {
    id: 'light-speed-out-right',
    label: 'Light speed out right',
    group: 'Light speed',
    reanimated: 'LightSpeedOutRight',
    preview: [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(96px) skewX(-12deg)' }]
  }
]

export function presetById(id: string | undefined, phase: 'enter' | 'exit'): AnimationPresetDef | undefined {
  if (!id) return undefined
  const list = phase === 'enter' ? ENTERING_PRESETS : EXITING_PRESETS
  return list.find((p) => p.id === id)
}

/* ────────────────────────────────────────────────────────────────────────────
 * Easing — reanimated `Easing` factory calls + CSS approximations for preview
 * ──────────────────────────────────────────────────────────────────────────── */

export interface EasingDef {
  id: EasingKind
  label: string
  /** Exact expression emitted in generated code (no trailing parts). */
  code: string
  /** CSS easing for the canvas preview (WAAPI `easing`). */
  css: string
}

export const EASINGS: EasingDef[] = [
  { id: 'linear', label: 'Linear', code: 'Easing.linear', css: 'linear' },
  { id: 'ease', label: 'Ease', code: 'Easing.ease', css: 'ease' },
  { id: 'ease-in', label: 'Ease in', code: 'Easing.in(Easing.cubic)', css: 'cubic-bezier(0.32, 0, 0.67, 0)' },
  { id: 'ease-out', label: 'Ease out', code: 'Easing.out(Easing.cubic)', css: 'cubic-bezier(0.33, 1, 0.68, 1)' },
  { id: 'ease-in-out', label: 'Ease in out', code: 'Easing.inOut(Easing.cubic)', css: 'cubic-bezier(0.65, 0, 0.35, 1)' },
  { id: 'out-quad', label: 'Out quad', code: 'Easing.out(Easing.quad)', css: 'cubic-bezier(0.5, 1, 0.89, 1)' },
  { id: 'out-cubic', label: 'Out cubic', code: 'Easing.out(Easing.cubic)', css: 'cubic-bezier(0.33, 1, 0.68, 1)' },
  { id: 'out-quart', label: 'Out quart', code: 'Easing.out(Easing.poly(4))', css: 'cubic-bezier(0.17, 1, 0.41, 1)' },
  { id: 'out-expo', label: 'Out expo', code: 'Easing.out(Easing.exp)', css: 'cubic-bezier(0.19, 1, 0.22, 1)' },
  { id: 'out-back', label: 'Out back', code: 'Easing.out(Easing.back(2))', css: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  { id: 'out-bounce', label: 'Out bounce', code: 'Easing.out(Easing.bounce)', css: 'linear' },
  { id: 'in-cubic', label: 'In cubic', code: 'Easing.in(Easing.cubic)', css: 'cubic-bezier(0.32, 0, 0.67, 0)' },
  { id: 'in-out-cubic', label: 'In out cubic', code: 'Easing.inOut(Easing.cubic)', css: 'cubic-bezier(0.65, 0, 0.35, 1)' }
]

export function easingById(id: EasingKind | undefined): EasingDef | undefined {
  return id ? EASINGS.find((e) => e.id === id) : undefined
}

/* ────────────────────────────────────────────────────────────────────────────
 * Spec → code + preview
 * ──────────────────────────────────────────────────────────────────────────── */

export const DEFAULT_SPRING = { damping: 12, stiffness: 160 } as const
export const DEFAULT_DURATION_MS = 300

/**
 * Build the exact reanimated builder expression for a spec, e.g.
 *   `FadeInDown.delay(100).duration(300).easing(Easing.out(Easing.cubic))`
 *   `ZoomIn.springify().damping(12).stiffness(160)`
 * Returns the expression plus every named symbol that must be imported from
 * 'react-native-reanimated' (the builder class, plus `Easing` when used).
 * Returns null when the preset id is unknown.
 */
export function animationToCode(
  spec: AnimationSpec,
  phase: 'enter' | 'exit'
): { expr: string; imports: string[] } | null {
  const preset = presetById(spec.preset, phase)
  if (!preset) return null
  const imports = new Set<string>([preset.reanimated])
  const parts: string[] = []

  if (spec.delayMs && spec.delayMs > 0) parts.push(`delay(${Math.round(spec.delayMs)})`)

  if (spec.spring) {
    parts.push('springify()')
    const spring = { ...DEFAULT_SPRING, ...spec.spring }
    if (spring.damping != null) parts.push(`damping(${round2(spring.damping)})`)
    if (spring.stiffness != null) parts.push(`stiffness(${round2(spring.stiffness)})`)
    if (spring.mass != null) parts.push(`mass(${round2(spring.mass)})`)
    if (spring.overshootClamping) parts.push('overshootClamping(true)')
  } else {
    parts.push(`duration(${Math.max(0, Math.round(spec.durationMs ?? DEFAULT_DURATION_MS))})`)
    const easing = easingById(spec.easing)
    if (easing && easing.id !== 'ease') {
      // `Easing.ease` is the builder default; only emit explicit easing otherwise.
      imports.add('Easing')
      parts.push(`easing(${easing.code})`)
    }
  }

  return { expr: `${preset.reanimated}${parts.map((p) => `.${p}`).join('')}`, imports: [...imports].sort() }
}

/** WAAPI keyframe list + total duration for the canvas preview. */
export function animationToPreview(
  spec: AnimationSpec,
  phase: 'enter' | 'exit'
): { keyframes: Array<Record<string, string | number>>; durationMs: number; easing?: string } | null {
  const preset = presetById(spec.preset, phase)
  if (!preset) return null
  const durationMs = Math.max(
    1,
    Math.round(
      spec.spring
        ? Math.max(200, (spec.spring.stiffness ?? DEFAULT_SPRING.stiffness) * 2)
        : (spec.durationMs ?? DEFAULT_DURATION_MS) + (spec.delayMs ?? 0)
    )
  )
  const easing = spec.spring ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' : (easingById(spec.easing)?.css ?? 'ease')
  return { keyframes: preset.preview, durationMs, easing }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
