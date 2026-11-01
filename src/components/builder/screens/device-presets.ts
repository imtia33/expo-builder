/*
 * ExpoForge device presets — logical points (dp), which is exactly the unit react-native
 * uses. Dimensions are current-generation approximations; the list is data (easily edited).
 * OPEN QUESTION (docs/03-design.md §10.2): custom-size editor — deferred, v1 ships presets.
 */

export type PlatformId = 'ios' | 'android'

export interface DevicePreset {
  id: string
  label: string
  platform: PlatformId
  width: number
  height: number
  /** Screen corner radius (px, canvas space). */
  radius: number
  /** Status bar height (px) — also the safe-area top inset. */
  statusBar: number
  /** Bottom system bar height (home indicator / gesture bar). */
  bottomBar: number
  notch: 'island' | 'punch' | 'none' | 'bezel'
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'iphone-17-pro',
    label: 'iPhone 17 Pro',
    platform: 'ios',
    width: 402,
    height: 874,
    radius: 62,
    statusBar: 59,
    bottomBar: 34,
    notch: 'island'
  },
  {
    id: 'iphone-17',
    label: 'iPhone 17',
    platform: 'ios',
    width: 393,
    height: 852,
    radius: 55,
    statusBar: 54,
    bottomBar: 34,
    notch: 'island'
  },
  {
    id: 'iphone-17-pro-max',
    label: 'iPhone 17 Pro Max',
    platform: 'ios',
    width: 440,
    height: 956,
    radius: 62,
    statusBar: 59,
    bottomBar: 34,
    notch: 'island'
  },
  {
    id: 'iphone-se',
    label: 'iPhone SE',
    platform: 'ios',
    width: 375,
    height: 667,
    radius: 40,
    statusBar: 20,
    bottomBar: 0,
    notch: 'bezel'
  },
  {
    id: 'ipad-pro-11',
    label: 'iPad Pro 11"',
    platform: 'ios',
    width: 834,
    height: 1194,
    radius: 40,
    statusBar: 24,
    bottomBar: 20,
    notch: 'none'
  },
  {
    id: 'pixel-10',
    label: 'Pixel 10',
    platform: 'android',
    width: 400,
    height: 880,
    radius: 48,
    statusBar: 32,
    bottomBar: 24,
    notch: 'punch'
  },
  {
    id: 'pixel-10-pro',
    label: 'Pixel 10 Pro',
    platform: 'android',
    width: 412,
    height: 904,
    radius: 52,
    statusBar: 32,
    bottomBar: 24,
    notch: 'punch'
  },
  {
    id: 'galaxy-s26',
    label: 'Galaxy S26',
    platform: 'android',
    width: 384,
    height: 854,
    radius: 44,
    statusBar: 30,
    bottomBar: 24,
    notch: 'punch'
  }
]

export function deviceById(id: string): DevicePreset {
  return DEVICE_PRESETS.find((d) => d.id === id) ?? DEVICE_PRESETS[0]
}
