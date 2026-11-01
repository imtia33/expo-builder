'use client'

/*
 * Screen tab — the artboard inspector for a selected screen. Renaming updates
 * the route live (the chip under the name field predicts the slug from the
 * draft while typing); device/platform/safe-area/background write straight to
 * the store; canvas X/Y are scrub fields over moveScreenCanvas.
 */

import { useId, useState } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'

import { floatingSurface } from '@/app/theme/overlay'
import { panelFieldBase } from '@/app/theme/panel/field/base'
import { DEVICE_PRESETS, deviceById, type PlatformId } from '@/components/builder/screens/device-presets'
import { slugify, useProjectStore } from '@/lib/project/store'
import type { Screen } from '@/lib/project/types'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '../collapsible-section'
import { SectionFields } from '../field-grid'
import { SegmentedField } from '../fields/simple-fields'
import type { FieldChangeValue, PanelSection } from '../schema'

const selectContentClass = cn(
  'z-[110] overflow-hidden p-1 text-[11px]',
  floatingSurface,
  'max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[var(--radix-select-trigger-width)]',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
  'duration-150 motion-reduce:animate-none data-[state=closed]:animate-none'
)
const selectItemClass =
  'relative flex h-7 cursor-pointer items-center gap-2 rounded-md pr-2 pl-7 text-surface outline-none select-none data-[disabled]:pointer-events-none data-[highlighted]:bg-hover data-[disabled]:opacity-50'
const selectIndicatorClass = 'absolute inset-y-0 left-0 inline-flex w-6 items-center justify-center text-primary'
const selectLabelClass = 'flex h-6 items-center gap-1.5 pr-2 pl-6 text-[10px] font-medium text-muted uppercase'

/** Device preset picker with iOS / Android group headers. */
function DeviceSelect({ screen }: { screen: Screen }) {
  const setScreenDevice = useProjectStore((s) => s.setScreenDevice)
  const labelId = useId()
  const groups: { platform: PlatformId; label: string; icon: IconSlot }[] = [
    { platform: 'ios', label: 'iOS', icon: 'platform.ios' },
    { platform: 'android', label: 'Android', icon: 'platform.android' }
  ]

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <label id={labelId} className="w-16 shrink-0 truncate text-[11px] leading-none text-muted">
        Device
      </label>
      <SelectPrimitive.Root value={screen.deviceId} onValueChange={(deviceId) => setScreenDevice(screen.id, deviceId)}>
        <SelectPrimitive.Trigger
          aria-labelledby={labelId}
          aria-label="Device preset"
          className={cn(panelFieldBase, 'flex min-w-0 flex-1 items-center justify-between text-[11px]')}
        >
          <span className="min-w-0 flex-1 truncate text-left">{deviceById(screen.deviceId).label}</span>
          <SelectPrimitive.Icon asChild>
            <SlotIcon slot="inspector.chevron-down" aria-hidden="true" className="ml-1 size-3 shrink-0 text-muted" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content position="popper" sideOffset={4} className={selectContentClass}>
            <SelectPrimitive.Viewport className="p-0.5">
              {groups.map((group) => (
                <SelectPrimitive.Group key={group.platform}>
                  <SelectPrimitive.Label className={selectLabelClass}>
                    <SlotIcon aria-hidden="true" slot={group.icon} className="size-3" />
                    {group.label}
                  </SelectPrimitive.Label>
                  {DEVICE_PRESETS.filter((d) => d.platform === group.platform).map((device) => (
                    <SelectPrimitive.Item key={device.id} value={device.id} className={selectItemClass}>
                      <span className={selectIndicatorClass}>
                        <SelectPrimitive.ItemIndicator>
                          <SlotIcon slot="inspector.check" aria-hidden="true" className="size-3" />
                        </SelectPrimitive.ItemIndicator>
                      </span>
                      <SelectPrimitive.ItemText>{device.label}</SelectPrimitive.ItemText>
                      <span className="ml-auto shrink-0 pl-2 text-[10px] tabular-nums text-muted">
                        {device.width}×{device.height}
                      </span>
                    </SelectPrimitive.Item>
                  ))}
                </SelectPrimitive.Group>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </div>
  )
}

/** Platform is ONE editor-global toggle (top bar) — no per-screen platform UI here. */

export interface ScreenTabProps {
  screen: Screen
  className?: string
}

export function ScreenTab({ screen, className }: ScreenTabProps) {
  const data = useProjectStore((s) => s.data)
  const renameScreen = useProjectStore((s) => s.renameScreen)
  const setScreenSafeArea = useProjectStore((s) => s.setScreenSafeArea)
  const setScreenBackground = useProjectStore((s) => s.setScreenBackground)
  const moveScreenCanvas = useProjectStore((s) => s.moveScreenCanvas)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)

  const [nameDraft, setNameDraft] = useState(screen.name)
  const [nameFocused, setNameFocused] = useState(false)
  if (!nameFocused && nameDraft !== screen.name) setNameDraft(screen.name)

  const device = deviceById(screen.deviceId)

  /** Live route prediction: slugified draft, kept unique against other screens. */
  const predictedRoute = (() => {
    const taken = new Set(data.screens.filter((s) => s.id !== screen.id).map((s) => s.route))
    let candidate = slugify(nameDraft)
    let suffix = 2
    while (taken.has(candidate)) candidate = `${slugify(nameDraft)}-${suffix++}`
    return candidate
  })()

  function commitName() {
    setNameFocused(false)
    if (nameDraft.trim() && nameDraft !== screen.name) renameScreen(screen.id, nameDraft)
    else setNameDraft(screen.name)
  }

  function handleFieldChange(_sectionId: string, fieldId: string, value: FieldChangeValue) {
    switch (fieldId) {
      case 'safe-top':
        setScreenSafeArea(screen.id, { top: value === true })
        return
      case 'safe-bottom':
        setScreenSafeArea(screen.id, { bottom: value === true })
        return
      case 'background':
        // ColorField Clear ('') would emit an invalid empty literal — restore the
        // canonical screen default instead (screens always carry a background).
        setScreenBackground(screen.id, value === '' ? '#FFFFFF' : String(value))
        return
      case 'canvas-x':
        moveScreenCanvas(screen.id, Number(value), screen.y)
        return
      case 'canvas-y':
        moveScreenCanvas(screen.id, screen.x, Number(value))
        return
    }
  }

  const screenSection = { id: 'screen-identity', title: 'Screen' }

  const deviceSection: PanelSection = {
    id: 'screen-device',
    title: 'Device & safe area',
    entries: [
      {
        kind: 'switch',
        id: 'safe-top',
        label: 'Safe top',
        value: screen.safeArea.top
      },
      {
        kind: 'switch',
        id: 'safe-bottom',
        label: 'Safe bottom',
        value: screen.safeArea.bottom
      }
    ]
  }

  const canvasSection: PanelSection = {
    id: 'screen-canvas',
    title: 'Canvas',
    entries: [
      { kind: 'color', id: 'background', label: 'Background', value: screen.background },
      {
        id: '__canvas-pos',
        columns: 2,
        fields: [
          { kind: 'number', id: 'canvas-x', label: 'Canvas X', value: screen.x, glyph: 'X', step: 1 },
          { kind: 'number', id: 'canvas-y', label: 'Canvas Y', value: screen.y, glyph: 'Y', step: 1 }
        ]
      }
    ]
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin', className)}>
      <CollapsibleSection id={screenSection.id} title={screenSection.title}>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="screen-name-input" className="w-16 shrink-0 truncate text-[11px] leading-none text-muted">
              Name
            </label>
            <input
              id="screen-name-input"
              type="text"
              className={cn(panelFieldBase, 'h-6 min-w-0 flex-1 px-2 text-[11px] text-surface')}
              value={nameDraft}
              autoComplete="off"
              spellCheck={false}
              aria-label="Screen name"
              onChange={(event) => setNameDraft(event.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setNameDraft(screen.name)
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
          <p className="flex min-w-0 items-center gap-1.5 pl-[70px] text-[10px] text-muted">
            <span aria-hidden="true">→</span>
            <span className="truncate font-mono">
              /{nameFocused || nameDraft !== screen.name ? predictedRoute : screen.route}
            </span>
            {nameFocused && predictedRoute !== screen.route ? (
              <span className="shrink-0 rounded bg-panel-field px-1 text-[9px]">updates on commit</span>
            ) : null}
          </p>
          <p className="pl-[70px] text-[10px] tabular-nums text-muted">
            {device.label} · {device.width} × {device.height} dp
          </p>
        </div>
      </CollapsibleSection>

      <CollapsibleSection id={deviceSection.id} title={deviceSection.title}>
        <div className="flex min-w-0 flex-col gap-2.5">
          <DeviceSelect screen={screen} />
          <SectionFields
            section={deviceSection}
            onFieldChange={handleFieldChange}
            onScrubStart={beginGesture}
            onScrubEnd={endGesture}
          />
        </div>
      </CollapsibleSection>

      <CollapsibleSection id={canvasSection.id} title={canvasSection.title}>
        <SectionFields
          section={canvasSection}
          onFieldChange={handleFieldChange}
          onScrubStart={beginGesture}
          onScrubEnd={endGesture}
        />
      </CollapsibleSection>
      <div className="h-6 shrink-0" aria-hidden="true" />
    </div>
  )
}
