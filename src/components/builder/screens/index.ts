'use client'
/*
 * Screens area barrel — canvas host, artboards, device presets, zoom bounds.
 * Integration contract: <CanvasHost activeTool insertTool onPlaced className? />
 * and projectBoundsAll()/projectBoundsActive() for the zoom shortcuts.
 */

export { CanvasHost, type CanvasHostProps, type CanvasTool } from './canvas-host'
export { ScreenArtboard, type ScreenArtboardProps } from './screen-artboard'
export {
  deviceById,
  DEVICE_PRESETS,
  type DevicePreset,
  type PlatformId
} from './device-presets'
export { projectBoundsAll, projectBoundsActive } from './project-bounds'
