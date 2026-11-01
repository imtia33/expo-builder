'use client'

/*
 * RightPanel — the contextual inspector. It owns NO data: everything (project,
 * selection, revision) comes from the project store, and the tab strip is
 * derived from the selection kind:
 *
 *   node    → Properties | Style | Code
 *   screen  → Screen | Code
 *   group   → Navigation | Code
 *   nothing → Project
 *
 * The header carries the selection identity (icon + name + kind chip, e.g.
 * "View · on Home"); with nothing selected it shows the project summary. Tab
 * bodies stay mounted (`forceMount` + hidden) so scroll positions and the Code
 * tab's state survive switches. Only the body scrolls; the strip is fixed.
 */

import { useState } from 'react'
import { tv } from 'tailwind-variants'

import panelHeaderTheme from '@/app/theme/panel/header'
import propertiesTabsTheme from '@/app/theme/panel/properties-tabs'
import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'
import { layerIconSlot, NAV_ICON } from '@/components/builder/left-panel/kind-icons'
import { deviceById } from '@/components/builder/screens/device-presets'
import { getEntry, type RegistryEntry } from '@/expoforge/registry'
import { screensInBucket, useProjectStore } from '@/lib/project/store'
import type { ProjectNode, Screen, ScreenGroup } from '@/lib/project/types'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { RightPanelProps, TabId } from './schema'
import { CodeTab } from './tabs/code-tab'
import { NavTab } from './tabs/nav-tab'
import { ProjectTab } from './tabs/project-tab'
import { PropsTab } from './tabs/props-tab'
import { ScreenTab } from './tabs/screen-tab'
import { StyleTab } from './tabs/style-tab'

const tabStyles = tv(propertiesTabsTheme)
const headerStyles = tv(panelHeaderTheme)

/** Registry fallback for nodes whose entry has not landed yet (parallel tasks). */
const FALLBACK_STYLE_SECTIONS = ['layout', 'spacing', 'appearance', 'effects'] as RegistryEntry['styleSections']

interface TabDef {
  value: TabId
  label: string
  icon: IconSlot
}

const PROPS_TAB: TabDef = { value: 'props', label: 'Properties', icon: 'inspector.tab-props' }
const STYLE_TAB: TabDef = { value: 'style', label: 'Style', icon: 'inspector.tab-style' }
const SCREEN_TAB: TabDef = { value: 'screen', label: 'Screen', icon: 'inspector.tab-screen' }
const NAV_TAB: TabDef = { value: 'nav', label: 'Navigation', icon: 'inspector.tab-nav' }
const CODE_TAB: TabDef = { value: 'code', label: 'Code', icon: 'inspector.tab-code' }
const PROJECT_TAB: TabDef = { value: 'project', label: 'Project', icon: 'inspector.tab-project' }

/** Tab bodies: mounted once, hidden when inactive (keeps scroll + editor state). */
const TAB_CONTENT_CLASS = cn(
  'absolute inset-0 flex min-h-0 flex-col outline-none',
  'data-[state=inactive]:hidden',
  'data-[state=active]:animate-in data-[state=active]:fade-in-0 duration-150 motion-reduce:animate-none'
)

export function RightPanel({ className }: RightPanelProps) {
  const data = useProjectStore((s) => s.data)
  const selection = useProjectStore((s) => s.selection)

  /* ── Resolve the selection into concrete entities (may all be null).
   *    kind 'nav' (tab bar / stack header clicked on the canvas) resolves its
   *    GROUP — the Navigation tab is the inspector for navigator chrome. ── */
  const group: ScreenGroup | null =
    selection?.kind === 'group' || selection?.kind === 'nav'
      ? (data.groups.find((g) => g.id === selection.groupId) ?? null)
      : null
  const screen: Screen | null =
    selection?.kind === 'screen'
      ? (data.screens.find((s) => s.id === selection.screenId) ?? null)
      : selection?.kind === 'node'
        ? (data.screens.find((s) => s.id === selection.screenId) ?? null)
        : null
  const node: ProjectNode | null =
    selection?.kind === 'node' ? (data.nodes[selection.nodeId] ?? null) : null

  // A node selection without a live node/screen (deleted mid-undo) falls back
  // to the project view — the inspector never shows stale entities.
  const effectiveSelection =
    selection?.kind === 'group' && !group
      ? null
      : selection?.kind === 'nav' && !group
        ? null
        : selection?.kind === 'screen' && !screen
          ? null
          : selection?.kind === 'node' && (!node || !screen)
            ? null
            : selection

  const kind: 'node' | 'screen' | 'group' | 'nav' | null =
    effectiveSelection === null ? null : (effectiveSelection.kind as 'node' | 'screen' | 'group' | 'nav')

  const entry: RegistryEntry | null = node ? (getEntry(node.type) ?? null) : null

  /* ── Contextual tab strip. ── */
  const tabs: TabDef[] =
    kind === 'node'
      ? [PROPS_TAB, STYLE_TAB, CODE_TAB]
      : kind === 'screen'
        ? [SCREEN_TAB, CODE_TAB]
        : kind === 'group' || kind === 'nav'
          ? [NAV_TAB, CODE_TAB]
          : [PROJECT_TAB]

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0].value)
  // Reset to the first contextual tab whenever the current one disappears.
  if (!tabs.some((tab) => tab.value === activeTab)) {
    setActiveTab(tabs[0].value)
  }

  const tabSlots = tabStyles()
  const headerSlots = headerStyles()

  /* ── Header identity. ── */
  const identity = (() => {
    if (kind === 'node' && node) {
      const name = node.name?.trim() || entry?.name || node.type
      return {
        icon: layerIconSlot(node.type),
        name,
        chip: `${entry?.name ?? node.type} · on ${screen?.name ?? 'screen'}`
      }
    }
    if (kind === 'screen' && screen) {
      return {
        icon: 'tree.screen' as IconSlot,
        name: screen.name,
        chip: `Screen · ${deviceById(screen.deviceId).label}`
      }
    }
    if (kind === 'nav' && group) {
      // Navigator chrome picked on the canvas (tab bar / stack header).
      const partLabel = (effectiveSelection as { kind: 'nav'; part: string }).part === 'tabbar' ? 'Tab bar' : 'Header'
      const navLabel = group.nav.kind === 'tabs' ? 'Tabs' : group.nav.kind === 'stack' ? 'Stack' : 'No navigator'
      return {
        icon: NAV_ICON[group.nav.kind],
        name: group.name,
        chip: `${partLabel} · ${navLabel}`
      }
    }
    if (kind === 'group' && group) {
      const navLabel = group.nav.kind === 'tabs' ? 'Tabs' : group.nav.kind === 'stack' ? 'Stack' : 'No navigator'
      return {
        icon: NAV_ICON[group.nav.kind],
        name: group.name,
        chip: `Group · ${navLabel} · ${screensInBucket(data, group.id).length} screens`
      }
    }
    return {
      icon: 'inspector.tab-project' as IconSlot,
      name: data.name,
      chip: `Project · ${data.screens.length} screen${data.screens.length === 1 ? '' : 's'}`
    }
  })()

  return (
    <aside
      aria-label="Inspector"
      className={cn('flex h-full min-w-0 flex-col border-l border-border bg-panel', className)}
      style={{ contain: 'paint layout style' }}
    >
      {/* Header: selection identity (icon + name + kind chip). */}
      <header className={cn(headerSlots.root(), 'py-1.5')}>
        <span className={cn(headerSlots.icon(), 'items-center justify-center')}>
          <SlotIcon aria-hidden="true" slot={identity.icon} className="size-3.5" />
        </span>
        <span className={headerSlots.title()}>{identity.name}</span>
        <span className="min-w-0 shrink-0 truncate rounded-full bg-panel-field px-1.5 py-0.5 text-[10px] text-muted">
          {identity.chip}
        </span>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as TabId)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList
          className={cn(
            // Neutralize the shadcn list base, then apply the ported theme slots.
            'bg-transparent h-10 w-full justify-start gap-0.5 rounded-none p-0 py-0',
            tabSlots.list()
          )}
        >
          {tabs.map(({ value, label, icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                // Neutralize the shadcn trigger base, then apply the theme slots.
                'h-auto flex-none border-0 bg-transparent px-1.5 py-1 text-[11px] rounded',
                'data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                'dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-transparent',
                tabSlots.trigger()
              )}
            >
              <SlotIcon aria-hidden="true" slot={icon} className={tabSlots.icon()} />
              <span className={tabSlots.label()}>{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="relative min-h-0 flex-1">
          {kind === 'node' && node ? (
            <>
              <TabsContent forceMount value="props" className={TAB_CONTENT_CLASS}>
                <PropsTab node={node} entry={entry ?? fallbackEntry(node)} />
              </TabsContent>
              <TabsContent forceMount value="style" className={TAB_CONTENT_CLASS}>
                {screen ? (
                  <StyleTab node={node} entry={entry ?? fallbackEntry(node)} screen={screen} />
                ) : null}
              </TabsContent>
            </>
          ) : (
            <TabsContent value="props" className={TAB_CONTENT_CLASS} />
          )}

          {kind === 'screen' && screen ? (
            <TabsContent forceMount value="screen" className={TAB_CONTENT_CLASS}>
              <ScreenTab screen={screen} />
            </TabsContent>
          ) : (
            <TabsContent value="screen" className={TAB_CONTENT_CLASS} />
          )}

          {(kind === 'group' || kind === 'nav') && group ? (
            <TabsContent forceMount value="nav" className={TAB_CONTENT_CLASS}>
              <NavTab group={group} />
            </TabsContent>
          ) : (
            <TabsContent value="nav" className={TAB_CONTENT_CLASS} />
          )}

          {kind === null ? (
            <TabsContent forceMount value="project" className={TAB_CONTENT_CLASS}>
              <ProjectTab />
            </TabsContent>
          ) : (
            <TabsContent value="project" className={TAB_CONTENT_CLASS} />
          )}

          {kind !== null ? (
            <TabsContent forceMount value="code" className={TAB_CONTENT_CLASS}>
              <CodeTab selection={effectiveSelection} />
            </TabsContent>
          ) : (
            <TabsContent value="code" className={TAB_CONTENT_CLASS} />
          )}
        </div>
      </Tabs>
    </aside>
  )
}

/**
 * Graceful fallback for registry entries that have not landed yet (components
 * are added in parallel): generic name/icon, no props, the standard style set.
 * The inspector stays usable and only writes valid RN style keys.
 */
function fallbackEntry(node: ProjectNode): RegistryEntry {
  return {
    id: node.type,
    name: node.type.charAt(0).toUpperCase() + node.type.slice(1),
    icon: 'ph:cube',
    category: 'layout',
    description: `${node.type} — registry entry pending; editing generic style keys only.`,
    children: 'none',
    insert: { width: 160 },
    props: [],
    styleSections: FALLBACK_STYLE_SECTIONS,
    codegen: { import: `import { ${node.type} } from 'react-native'`, component: node.type },
    previewNote: undefined
  }
}

export default RightPanel
