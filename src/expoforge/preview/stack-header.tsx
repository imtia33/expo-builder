'use client'
/*
 * StackHeaderPreview — regular DOM (NOT react-native-web) stack header chrome
 * for a stack group. Mirrors a native-stack header: 44pt on iOS / 56dp on
 * Android, back chevron in the tint color at the leading edge, centered
 * 600-weight title. The title string is passed in by the canvas (the shown
 * screen's name).
 */
import type { CSSProperties } from 'react'

import { SlotIcon } from '@/components/builder/icons/slots'
import type { PlatformId } from '@/components/builder/screens/device-presets'
import type { StackNavConfig } from '@/lib/project/types'

export interface StackHeaderPreviewProps {
  config: StackNavConfig
  platform: PlatformId
  /** Title of the currently shown screen. */
  title: string
  /** Back chevron activation — pops the simulated stack. */
  onBack: () => void
}

export function StackHeaderPreview({ config, platform, title, onBack }: StackHeaderPreviewProps) {
  const height = platform === 'ios' ? 44 : 56

  const headerStyle: CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    height,
    backgroundColor: config.headerBg,
    flex: 'none',
    userSelect: 'none'
  }

  // Native-stack titles stay optically centered regardless of the back button;
  // an absolutely-positioned center region achieves that here too.
  const titleRegionStyle: CSSProperties = {
    position: 'absolute',
    left: 56,
    right: 56,
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  }

  const backStyle: CSSProperties = {
    position: 'absolute',
    left: 4,
    top: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    border: 'none',
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent'
  }

  return (
    <header style={headerStyle}>
      <button type="button" aria-label="Go back" style={backStyle} onClick={onBack}>
        {/* SlotIcon renders currentColor, so the header tint rides a wrapper
         *    span — the icon slot itself carries no color prop. */}
        <span style={{ display: 'flex', color: config.headerTintColor }}>
          <SlotIcon slot="canvas.stack-back" size={20} aria-hidden />
        </span>
      </button>
      <div style={titleRegionStyle}>
        <span
          style={{
            fontSize: config.headerTitleSize,
            fontWeight: 600,
            color: config.headerTitleColor,
            maxWidth: '100%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {title}
        </span>
      </div>
    </header>
  )
}
