/*
 * Color math for the paint picker — hex ⇄ RGB ⇄ HSV conversions (alpha is
 * carried separately as 0–100 by the picker). Small, dependency-free, exact.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsv {
  /** 0–360 */
  h: number
  /** 0–1 */
  s: number
  /** 0–1 */
  v: number
}

const HEX_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

export function isValidHex(v: string): boolean {
  return HEX_RE.test(v)
}

/** Parse any hex form ('#abc', '#abcd', '#rrggbb', '#rrggbbaa') → rgb + alpha 0–1. */
export function parseHex(input: string): { rgb: Rgb; a: number } | null {
  const v = input.trim()
  if (!HEX_RE.test(v)) return null
  let h = v.slice(1)
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
  return { rgb: { r, g, b }, a }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0')
  return `#${to2(r)}${to2(g)}${to2(b)}`
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hh = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = v - c
  let rgb: [number, number, number]
  if (hh < 60) rgb = [c, x, 0]
  else if (hh < 120) rgb = [x, c, 0]
  else if (hh < 180) rgb = [0, c, x]
  else if (hh < 240) rgb = [0, x, c]
  else if (hh < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return { r: (rgb[0] + m) * 255, g: (rgb[1] + m) * 255, b: (rgb[2] + m) * 255 }
}

export function hexToHsv(hex: string): Hsv | null {
  const parsed = parseHex(hex)
  return parsed ? rgbToHsv(parsed.rgb) : null
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv))
}

/** '#rrggbb' + percent(0–100) → '#rrggbbaa' (100 → plain 6-digit hex). */
export function withAlpha(hex: string, percent: number): string {
  if (percent >= 100) return hex
  const a = Math.round((Math.max(0, Math.min(100, percent)) / 100) * 255)
  return `${hex}${a.toString(16).padStart(2, '0')}`
}

/** '#rrggbbaa' → { hex: '#rrggbb', alpha: 0–100 }. */
export function splitAlpha(input: string): { hex: string; alpha: number } {
  const parsed = parseHex(input)
  if (!parsed) return { hex: '#000000', alpha: 100 }
  return { hex: rgbToHex(parsed.rgb), alpha: Math.round(parsed.a * 100) }
}
