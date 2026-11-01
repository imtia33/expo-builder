'use client'
/*
 * TabBarPreview — regular DOM (NOT react-native-web) tab-bar chrome for a
 * tabs group. It lives OUTSIDE the RNW screen tree, so Iconify icons and DOM
 * elements are fine here. Mirrors the visual contract of an expo-router Tabs
 * bar: icon over label, active tint, optional top hairline, bottom or top
 * placement.
 *
 * Two implementations (§4.3 implementation switching), both previewed here
 * from the one TabsNavConfig:
 *  - 'native': the platform tab bar. Android's active tab gets a subtle
 *    Material-style pill highlight behind the icon; iOS stays plain.
 *  - 'custom': the look of the generated <CustomTabBar /> — a platform-neutral
 *    bar (no pill) with per-tab stacked icon+label and an animated active
 *    state ('spring' pops the icon to 1.12, 'fade' tweens opacity 0.72 → 1,
 *    'none' is static), dual-gated reduced motion.
 */
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'
import { motion, type Transition } from 'framer-motion'

import { IconifyIcon as Icon } from '@/components/builder/icons'
import type { PlatformId } from '@/components/builder/screens/device-presets'
import { useMotionEnabled } from '@/components/builder/shell/use-motion'
import type { CustomTabBarConfig, TabItemConfig, TabsNavConfig } from '@/lib/project/types'

export interface TabBarPreviewProps {
  config: TabsNavConfig
  platform: PlatformId
  /** The screen id the artboard currently shows (marks the active tab). */
  activeScreenId: string
  /** Fires on pointer-down for immediate Figma-like response. */
  onSelect: (screenId: string) => void
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared bar surface
 * ──────────────────────────────────────────────────────────────────────────── */

interface BarSurfaceSpec {
  height: number
  background: string
  position: 'bottom' | 'top'
  showTopBorder: boolean
  borderTopColor: string
  borderTopWidth: number
}

/**
 * The tab-list bar. The hairline sits on the content-facing edge: top edge for
 * a bottom bar, bottom edge for a top bar.
 */
function barSurfaceStyle(spec: BarSurfaceSpec): CSSProperties {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: spec.height,
    backgroundColor: spec.background,
    userSelect: 'none'
  }
  if (spec.showTopBorder) {
    const edge = `${spec.borderTopWidth}px solid ${spec.borderTopColor}`
    if (spec.position === 'top') style.borderBottom = edge
    else style.borderTop = edge
  }
  return style
}

/* ────────────────────────────────────────────────────────────────────────────
 * Native implementation — the platform tab bar (unchanged behavior)
 * ──────────────────────────────────────────────────────────────────────────── */

function TabButton({
  item,
  config,
  platform,
  active,
  onSelect
}: {
  item: TabItemConfig
  config: TabsNavConfig
  platform: PlatformId
  active: boolean
  onSelect: (screenId: string) => void
}) {
  const color = active ? config.activeColor : config.inactiveColor

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    // Immediate response + no focus steal / text selection while scrubbing tabs.
    event.preventDefault()
    onSelect(item.screenId)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(item.screenId)
    }
  }

  // Material 3-style pill behind the icon (Android active tab only).
  const pillStyle: CSSProperties =
    platform === 'android' && active
      ? {
          backgroundColor: `color-mix(in srgb, ${config.activeColor} 18%, transparent)`
        }
      : {}

  const buttonStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    border: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent'
  }

  return (
    <button
      key={item.screenId}
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={config.showLabels ? undefined : item.label}
      style={buttonStyle}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      {/* Icon chip — fixed horizontal padding keeps the pill visually stable */}
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2px 14px',
          borderRadius: 999,
          ...pillStyle
        }}
      >
        <Icon icon={item.icon} width={config.iconSize} height={config.iconSize} color={color} />
      </span>
      {config.showLabels ? (
        <span
          style={{
            fontSize: config.labelSize,
            fontWeight: config.labelWeight,
            color,
            lineHeight: 1.2,
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {item.label}
        </span>
      ) : null}
    </button>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Custom implementation — parity with the generated <CustomTabBar />
 * ──────────────────────────────────────────────────────────────────────────── */

/** 'spring': the active tab's icon pops up to this scale. */
const ACTIVE_ICON_SCALE = 1.12
/** 'fade': inactive icons rest at this opacity, active ones at 1. */
const FADE_INACTIVE_OPACITY = 0.72
/** 'fade' tween duration (160ms), in seconds for framer-motion. */
const FADE_DURATION_S = 0.16

/** The animated icon wrapper — a plain flex box so the transform is isolated. */
const ICON_WRAP_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
}

function CustomTabButton({
  item,
  config,
  active,
  onSelect
}: {
  item: TabItemConfig
  config: CustomTabBarConfig
  active: boolean
  onSelect: (screenId: string) => void
}) {
  const motionEnabled = useMotionEnabled()
  const color = active ? config.activeColor : config.inactiveColor

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    onSelect(item.screenId)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(item.screenId)
    }
  }

  const buttonStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    border: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent'
  }

  const tabIcon = (
    <Icon icon={item.icon} width={config.iconSize} height={config.iconSize} color={color} />
  )

  /* Active transition, mirroring the generated CustomTabBar: 'spring' scales
   * the icon on the configured spring; 'fade' tweens opacity 0.72 → 1;
   * 'none' stays static. The dual reduced-motion gate snaps instead of
   * animating (duration 0). */
  let iconAnimate: { scale?: number; opacity?: number } | undefined
  let iconTransition: Transition | undefined
  if (config.animation === 'spring') {
    iconAnimate = { scale: active ? ACTIVE_ICON_SCALE : 1 }
    iconTransition = motionEnabled
      ? { type: 'spring', damping: config.springDamping, stiffness: config.springStiffness }
      : { duration: 0 }
  } else if (config.animation === 'fade') {
    iconAnimate = { opacity: active ? 1 : FADE_INACTIVE_OPACITY }
    iconTransition = { duration: motionEnabled ? FADE_DURATION_S : 0, ease: 'easeOut' }
  }

  return (
    <button
      key={item.screenId}
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={config.showLabels ? undefined : item.label}
      style={buttonStyle}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      {iconAnimate ? (
        <motion.span style={ICON_WRAP_STYLE} animate={iconAnimate} transition={iconTransition}>
          {tabIcon}
        </motion.span>
      ) : (
        <span style={ICON_WRAP_STYLE}>{tabIcon}</span>
      )}
      {config.showLabels ? (
        <span
          style={{
            fontSize: config.labelSize,
            fontWeight: config.labelWeight,
            color,
            lineHeight: 1.2,
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {item.label}
        </span>
      ) : null}
    </button>
  )
}

/* ────────────────────────────────────────────────────────────────────────────
 * Dispatcher
 * ──────────────────────────────────────────────────────────────────────────── */

export function TabBarPreview({ config, platform, activeScreenId, onSelect }: TabBarPreviewProps) {
  // Custom implementation: the generated <CustomTabBar />'s look. Deliberately
  // platform-neutral (no Material pill) — the bar is the same on iOS/Android.
  if (config.impl === 'custom') {
    return (
      <nav
        role="tablist"
        aria-label="Tab bar"
        style={barSurfaceStyle({
          height: config.custom.barHeight,
          background: config.custom.barBackground,
          position: config.position,
          showTopBorder: config.custom.showTopBorder,
          borderTopColor: config.custom.borderTopColor,
          borderTopWidth: config.custom.borderTopWidth
        })}
      >
        {config.items.map((item) => (
          <CustomTabButton
            key={item.screenId}
            item={item}
            config={config.custom}
            active={item.screenId === activeScreenId}
            onSelect={onSelect}
          />
        ))}
      </nav>
    )
  }

  // Native implementation: the platform tab bar.
  return (
    <nav
      role="tablist"
      aria-label="Tab bar"
      style={barSurfaceStyle({
        height: config.barHeight,
        background: config.barBackground,
        position: config.position,
        showTopBorder: config.showTopBorder,
        borderTopColor: config.borderTopColor,
        borderTopWidth: config.borderTopWidth
      })}
    >
      {config.items.map((item) => (
        <TabButton
          key={item.screenId}
          item={item}
          config={config}
          platform={platform}
          active={item.screenId === activeScreenId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  )
}
