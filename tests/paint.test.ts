/*
 * Paint library tests (Phase 1): gradient math, CSS conversion, token
 * resolution, applyPaints degradation rules, and the codegen paint mapping
 * (token → RawCode identifier, gradient → LinearGradient attrs, theme files).
 */
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_THEME_COLORS,
  applyPaints,
  coercePaint,
  gradientCss,
  isGradientPaint,
  isSolidPaint,
  isTokenPaint,
  normalizeGradient,
  normalizeStops,
  paintLabel,
  paletteResolver
} from '@/lib/paint'
import { hsvToHex, rgbToHsv, splitAlpha, withAlpha } from '@/lib/paint/color-math'
import { gradientAttrs, paintsForCodegen, newPaintUsage, renderThemeConstants, renderUseThemeHook, tokenCode } from '@/lib/codegen/paint'
import type { RawCode } from '@/lib/codegen/format'

describe('paint type guards + normalization', () => {
  it('accepts legacy solid strings and rejects garbage', () => {
    expect(isSolidPaint('#FFF')).toBe(true)
    expect(isSolidPaint('#ffffff')).toBe(true)
    expect(isSolidPaint('#ff0000aa')).toBe(true)
    expect(isSolidPaint('')).toBe(true)
    expect(isSolidPaint('red')).toBe(false)
    expect(isSolidPaint('#12345')).toBe(false)
  })

  it('recognizes gradient and token paints', () => {
    expect(isGradientPaint({ type: 'linear-gradient', angle: 45, stops: [{ color: '#fff', position: 0 }, { color: '#000', position: 1 }] })).toBe(true)
    expect(isGradientPaint({ type: 'linear-gradient', angle: 45, stops: [{ color: '#fff', position: 0 }] })).toBe(false)
    expect(isTokenPaint({ token: 'primary' })).toBe(true)
    expect(isTokenPaint({ token: '' })).toBe(false)
  })

  it('normalizeStops sorts, clamps, and pins the ends', () => {
    const stops = normalizeStops([
      { color: '#a', position: 0.8 },
      { color: '#b', position: -1 },
      { color: '#c', position: 2 },
      { color: '#d', position: 0.3 }
    ])
    expect(stops.map((s) => s.position)).toEqual([0, 0.3, 0.8, 1])
  })

  it('normalizeGradient keeps ≥2 stops and wraps the angle', () => {
    const g = normalizeGradient({ type: 'linear-gradient', angle: 400, stops: [{ color: '#fff', position: 0.5 }] })
    if (g.type !== 'linear-gradient') throw new Error('expected a linear gradient after normalization')
    expect(g.angle).toBe(40)
    expect(g.stops.length).toBeGreaterThanOrEqual(2)
  })

  it('coercePaint passes through valid values and normalizes gradients', () => {
    expect(coercePaint('#ffffff')).toBe('#ffffff')
    expect(coercePaint({ token: 'x' })).toEqual({ token: 'x' })
    expect(coercePaint('nope')).toBeNull()
  })
})

describe('gradient CSS', () => {
  it('maps the builder angle convention to CSS (0° left→right → css 90deg)', () => {
    const g = { type: 'linear-gradient' as const, angle: 0, stops: [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 1 }] }
    expect(gradientCss(g)).toBe('linear-gradient(90deg, #ffffff 0%, #000000 100%)')
  })

  it('90° (top→bottom) becomes css 180deg', () => {
    const g = { type: 'linear-gradient' as const, angle: 90, stops: [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 1 }] }
    expect(gradientCss(g)).toBe('linear-gradient(180deg, #ffffff 0%, #000000 100%)')
  })

  it('radial gradients render as radial-gradient(circle, …)', () => {
    const g = { type: 'radial-gradient' as const, stops: [{ color: '#FDE68A', position: 0 }, { color: '#F97316', position: 1 }] }
    expect(gradientCss(g)).toBe('radial-gradient(circle, #FDE68A 0%, #F97316 100%)')
  })
})

describe('applyPaints', () => {
  const resolver = paletteResolver(DEFAULT_THEME_COLORS)

  it('resolves tokens against the palette for the active mode', () => {
    const out = applyPaints({ backgroundColor: { token: 'primary' } }, resolver, 'dark')
    expect(out).toEqual({ backgroundColor: DEFAULT_THEME_COLORS.primary.dark })
  })

  it('moves a gradient fill to backgroundImage and drops the key', () => {
    const g = { type: 'linear-gradient' as const, angle: 45, stops: [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 1 }] }
    const out = applyPaints({ backgroundColor: g, left: 10 }, resolver, 'light')
    expect(out.left).toBe(10)
    expect(out.backgroundColor).toBeUndefined()
    expect(String(out.backgroundImage)).toContain('linear-gradient(135deg')
  })

  it('degrades gradients on non-background keys to the first stop', () => {
    const g = { type: 'linear-gradient' as const, angle: 45, stops: [{ color: '#123456', position: 0 }, { color: '#000000', position: 1 }] }
    const out = applyPaints({ color: g }, resolver, 'light')
    expect(out).toEqual({ color: '#123456' })
  })

  it('degrades background gradients when the component cannot host one', () => {
    const g = { type: 'linear-gradient' as const, angle: 45, stops: [{ color: '#abcdef', position: 0 }, { color: '#000000', position: 1 }] }
    const out = applyPaints({ backgroundColor: g }, resolver, 'light', false)
    expect(out).toEqual({ backgroundColor: '#abcdef' })
  })

  it('keeps unknown keys and invalid color values untouched', () => {
    const style = { left: 4, backgroundColor: 42 }
    expect(applyPaints(style, resolver, 'light')).toBe(style)
  })

  it('unresolvable tokens are removed (recoverable unset)', () => {
    const out = applyPaints({ backgroundColor: { token: 'nope' }, top: 2 }, resolver, 'light')
    expect(out).toEqual({ top: 2 })
  })
})

describe('color math', () => {
  it('hex → hsv → hex round-trips', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#2563eb', '#0f0f0f']) {
      expect(hsvToHex(rgbToHsv({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) }))).toBe(hex)
    }
  })

  it('splitAlpha/withAlpha round-trip', () => {
    expect(splitAlpha('#ff0000aa')).toEqual({ hex: '#ff0000', alpha: 67 })
    expect(withAlpha('#ff0000', 67)).toBe('#ff0000ab') // 67% of 255 = 170.85 → 171
    expect(withAlpha('#ff0000', 100)).toBe('#ff0000')
  })
})

describe('codegen paint mapping', () => {
  it('maps tokens to colors.<name> RawCode and tracks usage', () => {
    const usage = newPaintUsage()
    const out = paintsForCodegen({ backgroundColor: { token: 'primary' }, left: 3 }, usage)
    expect(out.left).toBe(3)
    expect((out.backgroundColor as RawCode).code).toBe('colors.primary')
    expect(usage.tokens.has('primary')).toBe(true)
  })

  it('degrades gradient fills on non-container keys to the first stop', () => {
    const usage = newPaintUsage()
    const g = { type: 'linear-gradient' as const, angle: 0, stops: [{ color: '#111111', position: 0 }, { color: '#222222', position: 1 }] }
    const out = paintsForCodegen({ color: g }, usage)
    expect(out).toEqual({ color: '#111111' })
  })

  it('gradientAttrs emits locations for NON-uniform stops', () => {
    const g = { type: 'linear-gradient' as const, angle: 0, stops: [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 0.3 }, { color: '#ff0000', position: 1 }] }
    const attrs = gradientAttrs(g)
    expect(attrs.colors).toEqual(['#ffffff', '#000000', '#ff0000'])
    expect(attrs.locations).toEqual([0, 0.3, 1])
    expect(attrs.start).toEqual({ x: 0, y: 0.5 })
    expect(attrs.end).toEqual({ x: 1, y: 0.5 })
  })

  it('omits locations for uniform stops (expo-linear-gradient default)', () => {
    const g = { type: 'linear-gradient' as const, angle: 90, stops: [{ color: '#ffffff', position: 0 }, { color: '#000000', position: 0.5 }, { color: '#ff0000', position: 1 }] }
    expect(gradientAttrs(g).locations).toBeUndefined()
  })

  it('tokenCode renders the identifier', () => {
    expect(tokenCode('primary').code).toBe('colors.primary')
  })

  it('renders the plain-TS theme files (no NativeWind)', () => {
    const constants = renderThemeConstants({ primary: { light: '#2563EB', dark: '#3B82F6' } })
    expect(constants).toContain("export const COLORS = {")
    expect(constants).toContain("primary: '#2563EB'")
    expect(constants).toContain("primary: '#3B82F6'")
    expect(constants).toContain('light:')
    expect(constants).toContain('dark:')
    expect(constants).toContain('export type ThemeColorName')

    const hook = renderUseThemeHook()
    expect(hook).toContain("import { useColorScheme } from 'react-native'")
    expect(hook).toContain("import { COLORS } from '@/constants/theme'")
    expect(hook).toContain('export function useTheme()')
    expect(hook).not.toContain('nativewind')
  })
})

describe('paint labels', () => {
  it('labels tokens, gradients, and solids', () => {
    expect(paintLabel({ token: 'primary' })).toBe('{primary}')
    expect(paintLabel({ type: 'linear-gradient', angle: 0, stops: [{ color: '#fff', position: 0 }, { color: '#000', position: 1 }] })).toBe('Linear gradient')
    expect(paintLabel('#ffffff')).toBe('#FFFFFF')
    expect(paintLabel('')).toBe('None')
    expect(paintLabel(undefined)).toBe('None')
  })
})
