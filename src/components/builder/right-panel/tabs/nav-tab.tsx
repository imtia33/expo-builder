'use client'

/*
 * Navigation tab — a selected group's navigator config, 1:1 with the generated
 * `app/(<dirName>)/_layout.tsx`. Nav kind is a three-card selector (Tabs /
 * Stack / None → setNavKind; switching away from tabs resets tab settings — the
 * helper line says so, undo restores). Tabs config edits the bar + per-tab
 * items (icon picker, label, screen binding chip); stack config edits header,
 * animation and presentation.
 */

import { useState } from 'react'

import { panelFieldBase } from '@/app/theme/panel/field/base'
import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'
import { DEFAULT_TAB_ICONS, defaultStackConfig, defaultTabsConfig, screensInBucket, useProjectStore } from '@/lib/project/store'
import type { CustomTabBarConfig, ProjectData, ScreenGroup, StackNavConfig, TabItemConfig, TabsNavConfig } from '@/lib/project/types'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '../collapsible-section'
import { SectionFields } from '../field-grid'
import { IconPicker } from './icon-picker'
import type { FieldChangeValue, PanelSection } from '../schema'

const NAV_KIND_CARDS: { kind: 'tabs' | 'stack' | 'none'; label: string; icon: IconSlot; description: string }[] = [
  { kind: 'tabs', label: 'Tabs', icon: 'dialog.nav.tabs', description: 'Tab bar' },
  { kind: 'stack', label: 'Stack', icon: 'dialog.nav.stack', description: 'Push / pop' },
  { kind: 'none', label: 'None', icon: 'dialog.nav.none', description: 'Plain routes' }
]

const ANIMATION_OPTIONS = [
  { value: 'default', label: 'default' },
  { value: 'fade', label: 'fade' },
  { value: 'slide-from-right', label: 'slide-from-right' },
  { value: 'slide-from-left', label: 'slide-from-left' },
  { value: 'flip', label: 'flip' },
  { value: 'none', label: 'none' }
]

const PRESENTATION_OPTIONS = [
  { value: 'card', label: 'card' },
  { value: 'modal', label: 'modal' },
  { value: 'formSheet', label: 'formSheet' },
  { value: 'pageSheet', label: 'pageSheet' },
  { value: 'fullScreenModal', label: 'fullScreenModal' }
]

/*
 * ColorField's Clear emits '' — the nav configs are COMPLETE objects emitted
 * verbatim by codegen, so restore the canonical store default instead of
 * writing an invalid empty literal. Single source of truth: defaultTabsConfig /
 * defaultStackConfig (store.ts — LOCKED nav defaults).
 */
const TABS_DEFAULTS = defaultTabsConfig([])
const STACK_DEFAULTS = defaultStackConfig()

export interface NavTabProps {
  group: ScreenGroup
  className?: string
}

export function NavTab({ group, className }: NavTabProps) {
  const data = useProjectStore((s) => s.data)
  const renameGroup = useProjectStore((s) => s.renameGroup)
  const setNavKind = useProjectStore((s) => s.setNavKind)
  const patchTabs = useProjectStore((s) => s.patchTabsConfig)
  const patchCustom = useProjectStore((s) => s.patchCustomTabBar)
  const setTabBarImpl = useProjectStore((s) => s.setTabBarImpl)
  const patchStack = useProjectStore((s) => s.patchStackConfig)
  const beginGesture = useProjectStore((s) => s.beginGesture)
  const endGesture = useProjectStore((s) => s.endGesture)

  const [nameDraft, setNameDraft] = useState(group.name)
  const [nameFocused, setNameFocused] = useState(false)
  if (!nameFocused && nameDraft !== group.name) setNameDraft(group.name)

  const screens = screensInBucket(data, group.id)
  const tabs = group.nav.kind === 'tabs' ? group.nav.tabs : null
  const stack = group.nav.kind === 'stack' ? group.nav.stack : null

  function commitName() {
    setNameFocused(false)
    if (nameDraft.trim() && nameDraft !== group.name) renameGroup(group.id, nameDraft)
    else setNameDraft(group.name)
  }

  function handleTabsChange(_sectionId: string, fieldId: string, value: FieldChangeValue) {
    if (!tabs) return
    switch (fieldId) {
      case 'position':
        patchTabs(group.id, { position: value === 'top' ? 'top' : 'bottom' })
        return
      case 'showLabels':
        patchTabs(group.id, { showLabels: value === true })
        return
      case 'showTopBorder':
        patchTabs(group.id, { showTopBorder: value === true })
        return
      case 'impl': {
        // §4.3 implementation switching — the store migrates compatible
        // settings between the native bar and the generated CustomTabBar.
        setTabBarImpl(group.id, value === 'custom' ? 'custom' : 'native')
        return
      }
      case 'custom.animation':
        patchCustom(group.id, { animation: value as CustomTabBarConfig['animation'] })
        return
      case 'custom.springDamping':
        patchCustom(group.id, { springDamping: Number(value) })
        return
      case 'custom.springStiffness':
        patchCustom(group.id, { springStiffness: Number(value) })
        return
      default:
        patchTabs(group.id, {
          [fieldId]: value === '' ? TABS_DEFAULTS[fieldId as keyof TabsNavConfig] : value
        } as Partial<TabsNavConfig>)
    }
  }

  function handleStackChange(_sectionId: string, fieldId: string, value: FieldChangeValue) {
    if (fieldId === 'headerShown') {
      patchStack(group.id, { headerShown: value === true })
      return
    }
    patchStack(group.id, {
      [fieldId]: value === '' ? STACK_DEFAULTS[fieldId as keyof StackNavConfig] : value
    } as Partial<StackNavConfig>)
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-thin', className)}>
      {/* ── Group identity ── */}
      <CollapsibleSection id="nav-group" title="Group">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="group-name-input" className="w-16 shrink-0 truncate text-[11px] leading-none text-muted">
              Name
            </label>
            <input
              id="group-name-input"
              type="text"
              className={cn(panelFieldBase, 'h-6 min-w-0 flex-1 px-2 text-[11px] text-surface')}
              value={nameDraft}
              autoComplete="off"
              spellCheck={false}
              aria-label="Group name"
              onChange={(event) => setNameDraft(event.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.currentTarget.blur()
                } else if (event.key === 'Escape') {
                  event.preventDefault()
                  setNameDraft(group.name)
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
          <p className="flex min-w-0 items-center gap-1.5 pl-[70px] text-[10px] text-muted">
            <span aria-hidden="true">→</span>
            <span className="truncate font-mono">app/({group.dirName})/</span>
          </p>
          <p className="pl-[70px] text-[10px] text-muted">
            {screens.length} screen{screens.length === 1 ? '' : 's'} ·{' '}
            {group.nav.kind === 'tabs' ? 'Tabs navigator' : group.nav.kind === 'stack' ? 'Stack navigator' : 'No navigator'}
          </p>
        </div>
      </CollapsibleSection>

      {/* ── Nav kind cards ── */}
      <CollapsibleSection id="nav-kind" title="Navigator">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Navigator kind">
            {NAV_KIND_CARDS.map((card) => {
              const active = group.nav.kind === card.kind
              return (
                <button
                  key={card.kind}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setNavKind(group.id, card.kind)}
                  className={cn(
                    'flex min-w-0 flex-col items-center gap-1.5 rounded-md border px-1.5 py-2.5 text-center outline-none transition-colors',
                    'focus-visible:ring-1 focus-visible:ring-panel-focus',
                    active
                      ? 'border-accent bg-accent/10 text-surface'
                      : 'border-border bg-panel-field text-muted hover:bg-panel-field-hover hover:text-surface'
                  )}
                >
                  <SlotIcon aria-hidden="true" slot={card.icon} className={cn('size-5', active && 'text-primary')} />
                  <span className="text-[11px] font-medium">{card.label}</span>
                  <span className="text-[9px] leading-tight text-muted">{card.description}</span>
                </button>
              )
            })}
          </div>
          <p className="text-[10px] leading-relaxed text-muted">Switching resets that group's navigation settings.</p>
        </div>
      </CollapsibleSection>

      {/* ── Tabs config ── */}
      {tabs ? <TabsConfigSections group={group} tabs={tabs} onChange={handleTabsChange} onScrubStart={beginGesture} onScrubEnd={endGesture} /> : null}

      {/* ── Stack config ── */}
      {stack ? <StackSections group={group} onChange={handleStackChange} /> : null}

      <div className="h-6 shrink-0" aria-hidden="true" />
    </div>
  )
}

/** Tab label editor: draft commits on blur/Enter (one undo entry per edit). */
function TabLabelInput({
  screenName,
  label,
  onCommit
}: {
  screenName: string
  label: string
  onCommit: (label: string) => void
}) {
  const [draft, setDraft] = useState(label)
  const [focused, setFocused] = useState(false)
  if (!focused && draft !== label) setDraft(label)

  function commit() {
    setFocused(false)
    if (draft !== label && draft.trim() !== '') onCommit(draft)
    else setDraft(label)
  }

  return (
    <input
      type="text"
      value={draft}
      aria-label={`Tab label for ${screenName}`}
      autoComplete="off"
      spellCheck={false}
      className={cn(panelFieldBase, 'h-6 min-w-0 flex-1 px-2 text-[11px] text-surface')}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(label)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/* ─── Tabs config ──────────────────────────────────────────────────────────── */

function TabsConfigSections({
  group,
  tabs,
  onChange,
  onScrubStart,
  onScrubEnd
}: {
  group: ScreenGroup
  tabs: TabsNavConfig
  onChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}) {
  const data = useProjectStore((s) => s.data)
  const patchTabs = useProjectStore((s) => s.patchTabsConfig)
  const patchTabItem = useProjectStore((s) => s.patchTabItem)
  const screens = screensInBucket(data, group.id)

  /* §4.3 — implementation choice: the native platform bar vs the generated
   * <CustomTabBar />. Switching migrates compatible settings (store action). */
  const implSection: PanelSection = {
    id: 'nav-tabs-impl',
    title: 'Implementation',
    entries: [
      {
        kind: 'segmented',
        id: 'impl',
        label: 'Tab bar',
        value: tabs.impl,
        options: [
          { value: 'native', label: 'Native' },
          { value: 'custom', label: 'Custom' }
        ]
      },
      ...(tabs.impl === 'custom'
        ? ([
            {
              kind: 'select' as const,
              id: 'custom.animation',
              label: 'Active tab animation',
              value: tabs.custom.animation,
              options: [
                { value: 'none', label: 'none' },
                { value: 'spring', label: 'spring' },
                { value: 'fade', label: 'fade' }
              ]
            },
            ...(tabs.custom.animation === 'spring'
              ? ([
                  {
                    kind: 'number' as const,
                    id: 'custom.springDamping',
                    label: 'Spring damping',
                    value: tabs.custom.springDamping,
                    min: 1,
                    max: 30,
                    step: 0.5
                  },
                  {
                    kind: 'number' as const,
                    id: 'custom.springStiffness',
                    label: 'Spring stiffness',
                    value: tabs.custom.springStiffness,
                    min: 1,
                    step: 10
                  }
                ] as PanelSection['entries'])
              : [])
          ] as PanelSection['entries'])
        : [])
    ]
  }

  const barSection: PanelSection = {
    id: 'nav-tabs-bar',
    title: 'Tab bar',
    entries: [
      {
        kind: 'segmented',
        id: 'position',
        label: 'Position',
        value: tabs.position,
        options: [
          { value: 'bottom', label: 'Bottom' },
          { value: 'top', label: 'Top' }
        ]
      },
      { kind: 'switch', id: 'showLabels', label: 'Labels', value: tabs.showLabels },
      { kind: 'number', id: 'barHeight', label: 'Bar height', value: tabs.barHeight, min: 0, step: 1 },
      { kind: 'number', id: 'iconSize', label: 'Icon size', value: tabs.iconSize, min: 0, step: 1 },
      { kind: 'number', id: 'labelSize', label: 'Label size', value: tabs.labelSize, min: 0, step: 1 },
      {
        kind: 'select',
        id: 'labelWeight',
        label: 'Label weight',
        value: tabs.labelWeight,
        options: [
          { value: '400', label: '400' },
          { value: '500', label: '500' },
          { value: '600', label: '600' },
          { value: '700', label: '700' }
        ]
      }
    ]
  }

  const colorsSection: PanelSection = {
    id: 'nav-tabs-colors',
    title: 'Tab colors',
    entries: [
      { kind: 'color', id: 'activeColor', label: 'Active', value: tabs.activeColor },
      { kind: 'color', id: 'inactiveColor', label: 'Inactive', value: tabs.inactiveColor },
      { kind: 'color', id: 'barBackground', label: 'Bar', value: tabs.barBackground },
      { kind: 'switch', id: 'showTopBorder', label: 'Top border', value: tabs.showTopBorder },
      { kind: 'number', id: 'borderTopWidth', label: 'Border width', value: tabs.borderTopWidth, min: 0, step: 1 },
      { kind: 'color', id: 'borderTopColor', label: 'Border', value: tabs.borderTopColor }
    ]
  }

  return (
    <>
      <CollapsibleSection id={implSection.id} title={implSection.title}>
        <SectionFields section={implSection} onFieldChange={onChange} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
        <p className="px-1 pb-1 text-[10px] leading-relaxed text-muted">
          {tabs.impl === 'native'
            ? 'Expo Router <Tabs> — the platform renders the bar.'
            : 'A generated components/<Dir>TabBar.tsx — full visual control, wired through <Tabs tabBar={…}>.'}
        </p>
      </CollapsibleSection>
      <CollapsibleSection id={barSection.id} title={barSection.title}>
        <SectionFields section={barSection} onFieldChange={onChange} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
      </CollapsibleSection>
      <CollapsibleSection id={colorsSection.id} title={colorsSection.title}>
        <SectionFields section={colorsSection} onFieldChange={onChange} onScrubStart={onScrubStart} onScrubEnd={onScrubEnd} />
      </CollapsibleSection>
      <TabsListSection group={group} tabs={tabs} screens={screens} patchTabs={patchTabs} patchTabItem={patchTabItem} />
    </>
  )
}

/** One row per tab (screen order): [icon picker] [label input] [screen chip]. */
function TabsListSection({
  group,
  tabs,
  screens,
  patchTabs,
  patchTabItem
}: {
  group: ScreenGroup
  tabs: TabsNavConfig
  screens: ReturnType<typeof screensInBucket>
  patchTabs: (id: string, patch: Partial<TabsNavConfig>) => void
  patchTabItem: (groupId: string, screenId: string, patch: { label?: string; icon?: string }) => void
}) {
  // Rows follow SCREEN order; a screen whose item went missing (membership
  // edits outside moveScreen) falls back to the store's default tab and is
  // healed into the items array on its first edit.
  const rows = screens.map((screen, index) => {
    const item: TabItemConfig =
      tabs.items.find((it) => it.screenId === screen.id) ??
      ({ screenId: screen.id, label: screen.name, icon: DEFAULT_TAB_ICONS[index % DEFAULT_TAB_ICONS.length] } as TabItemConfig)
    return { screen, item }
  })

  function commitItem(screenId: string, patch: { label?: string; icon?: string }) {
    const hasItem = tabs.items.some((it) => it.screenId === screenId)
    if (hasItem) {
      patchTabItem(group.id, screenId, patch)
      return
    }
    // Self-heal: rebuild the items array including the missing entry.
    patchTabs(group.id, { items: rows.map(({ item }) => (item.screenId === screenId ? { ...item, ...patch } : item)) })
  }

  return (
    <CollapsibleSection id="nav-tabs-items" title="Tabs">
      <div className="flex min-w-0 flex-col gap-1.5">
        {rows.map(({ screen, item }) => (
          <div key={screen.id} className="flex min-w-0 items-center gap-1.5">
            <IconPicker
              value={item.icon}
              label={`Tab icon for ${screen.name}`}
              onChange={(icon) => commitItem(screen.id, { icon })}
            />
            <TabLabelInput
              screenName={screen.name}
              label={item.label}
              onCommit={(label) => commitItem(screen.id, { label })}
            />
            <span
              className="flex h-6 min-w-0 shrink-0 items-center gap-1 rounded bg-panel-field px-1.5 text-[10px] text-muted"
              title={`Bound to screen ${screen.name} (/${screen.route})`}
            >
              <span className="max-w-20 truncate">{screen.name}</span>
            </span>
          </div>
        ))}
        {screens.length === 0 ? <p className="px-1 text-[11px] text-muted">Add screens to this group to get tabs.</p> : null}
      </div>
    </CollapsibleSection>
  )
}

/* ─── Stack config ─────────────────────────────────────────────────────────── */

/* Stack fields read the live group from the store so undo/redo re-renders them. */
function StackSections({ group, onChange }: { group: ScreenGroup; onChange: (sectionId: string, fieldId: string, value: FieldChangeValue) => void }) {
  if (group.nav.kind !== 'stack') return null
  const stack = group.nav.stack
  const headerSection: PanelSection = {
    id: 'nav-stack-header',
    title: 'Header',
    entries: [
      { kind: 'switch', id: 'headerShown', label: 'Show header', value: stack.headerShown },
      { kind: 'color', id: 'headerBg', label: 'Background', value: stack.headerBg },
      { kind: 'color', id: 'headerTitleColor', label: 'Title', value: stack.headerTitleColor },
      { kind: 'number', id: 'headerTitleSize', label: 'Title size', value: stack.headerTitleSize, min: 0, step: 1 },
      { kind: 'color', id: 'headerTintColor', label: 'Tint', value: stack.headerTintColor }
    ]
  }
  const transitionSection: PanelSection = {
    id: 'nav-stack-transition',
    title: 'Transitions',
    entries: [
      { kind: 'select', id: 'animation', label: 'Animation', value: stack.animation, options: ANIMATION_OPTIONS },
      { kind: 'select', id: 'presentation', label: 'Presentation', value: stack.presentation, options: PRESENTATION_OPTIONS }
    ]
  }
  return (
    <>
      <CollapsibleSection id={headerSection.id} title={headerSection.title}>
        <SectionFields section={headerSection} onFieldChange={onChange} />
      </CollapsibleSection>
      <CollapsibleSection id={transitionSection.id} title={transitionSection.title}>
        <SectionFields section={transitionSection} onFieldChange={onChange} />
      </CollapsibleSection>
    </>
  )
}
