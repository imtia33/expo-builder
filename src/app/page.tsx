'use client'
/*
 * ExpoForge — the visual builder for real Expo apps (single user-facing route, `/`).
 * Assembly only: shell (top bar + resizable panels + chrome shortcuts), left panel
 * (hierarchy tree, zero props), canvas host (placement + manipulation + sim),
 * right panel (contextual inspector, zero props), bottom toolbar (tools only).
 */

import { useCallback, useMemo, useState } from 'react'

import type { InsertTool } from '@/lib/project/types'
import { useCanvasViewport } from '@/lib/canvas/viewport-store'
import {
  KeyboardHelp,
  TopBar,
  WorkspaceLayout,
  useBuilderShortcuts
} from '@/components/builder/shell'
import { LeftPanel } from '@/components/builder/left-panel'
import { RightPanel } from '@/components/builder/right-panel'
import { BuilderToolbar, useToolbarShortcuts, type ToolbarTool } from '@/components/builder/toolbar'
import { CanvasHost, projectBoundsActive, projectBoundsAll } from '@/components/builder/screens'

export default function Home() {
  const [tool, setTool] = useState<ToolbarTool>('select')

  /* ── zoom shortcuts (canvas area takes over the shell's reserved keys) ── */
  const extraShortcuts = useMemo(
    () => ({
      '$mod+0': () => useCanvasViewport.getState().zoomTo100(),
      '$mod+1': () => useCanvasViewport.getState().zoomToFit(() => projectBoundsAll()),
      'Shift+Digit1': () => useCanvasViewport.getState().zoomToFit(() => projectBoundsActive())
    }),
    []
  )
  const { helpOpen, setHelpOpen } = useBuilderShortcuts({ extra: extraShortcuts })
  useToolbarShortcuts(setTool)

  /* ── tool derivation: canvas wants select/hand + a separate placement tool ── */
  const canvasTool = tool === 'hand' ? ('hand' as const) : ('select' as const)
  const insertTool: InsertTool | null =
    tool === 'select' || tool === 'hand'
      ? null
      : tool.kind === 'screen'
        ? { kind: 'screen' }
        : { kind: 'component', type: tool.type }

  /* ── placement done/cancelled → back to select ── */
  const onPlaced = useCallback(() => setTool('select'), [])

  return (
    <div id="expoforge-root">
      <WorkspaceLayout
        topBar={<TopBar onHelp={() => setHelpOpen(true)} />}
        leftPanel={<LeftPanel />}
        canvas={
          <div className="relative h-full w-full">
            <CanvasHost activeTool={canvasTool} insertTool={insertTool} onPlaced={onPlaced} />
            <BuilderToolbar tool={tool} onToolChange={setTool} />
          </div>
        }
        rightPanel={<RightPanel />}
      />
      <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}
