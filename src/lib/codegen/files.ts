/*
 * File map assembly + Code tab tree.
 *
 * generateProjectFiles(data) → Map<path, contents> covering the app/ tree only:
 *
 *   app/_layout.tsx                    root Stack (+ anchor)
 *   app/(${dirName})/_layout.tsx       stack | tabs groups (never for 'none')
 *   app/(${dirName})/<route>.tsx       grouped screens
 *   app/<route>.tsx                    standalone screens
 *
 * Ordering rules:
 *   - root-level entries in MODEL ORDER: groups by group.order (a stack/tabs
 *     group contributes `(dir)`; a 'none' group contributes its screens'
 *     GROUP-PREFIXED route names `(dir)/route` — expo-router hoists layout-less
 *     directories onto the parent navigator but KEEPS the group segment in the
 *     child route name, verified against expo-router@58.0.29 source), then
 *     standalone screens by screen.order;
 *   - group screens in screen.order (buckets via screensInBucket);
 *   - empty groups materialize nothing.
 *
 * When no screens exist at all the project has no routable app/ tree — an
 * empty map is returned (per the Task 6-B spec).
 */

import { screensInBucket, sortedGroups } from '@/lib/project/store'
import type { ProjectData, ScreenGroup } from '@/lib/project/types'

import type { FileTreeNode } from './types'
import { customTabBarName, renderCustomTabBarComponent, renderRootLayout, renderStackLayout, renderTabsLayout } from './navigation'
import { renderScreenFile } from './screens'

export function generateProjectFiles(data: ProjectData): Map<string, string> {
  const files = new Map<string, string>()
  if (data.screens.length === 0) return files

  const rootEntries = computeRootEntries(data)
  if (rootEntries.length === 0) return files
  files.set('app/_layout.tsx', renderRootLayout(rootEntries))

  for (const group of sortedGroups(data)) {
    const screens = screensInBucket(data, group.id)
    if (screens.length === 0) continue
    if (group.nav.kind === 'tabs') {
      files.set(groupLayoutPath(group), renderTabsLayout(group, group.nav.tabs, screens))
      // §4.3 — the 'custom' tab bar implementation also generates its
      // component file; the layout imports it via <Tabs tabBar={…}>.
      if (group.nav.tabs.impl === 'custom') {
        files.set(`components/${customTabBarName(group)}.tsx`, renderCustomTabBarComponent(group, group.nav.tabs, screens))
      }
    } else if (group.nav.kind === 'stack') {
      files.set(groupLayoutPath(group), renderStackLayout(group, group.nav.stack, screens))
    }
    for (const s of screens) {
      files.set(`app/(${group.dirName})/${s.route}.tsx`, renderScreenFile(data, s))
    }
  }
  for (const s of screensInBucket(data, null)) {
    files.set(`app/${s.route}.tsx`, renderScreenFile(data, s))
  }
  return files
}

function groupLayoutPath(group: ScreenGroup): string {
  return `app/(${group.dirName})/_layout.tsx`
}

/**
 * Root-level navigator entries in model order: each group at its position —
 * stack/tabs groups contribute `(dirName)` (they own a _layout, so they are
 * layout routes); 'none' groups are transparent for URLS but their screens
 * still live under app/(dirName)/ — expo-router hoists them onto the root
 * navigator as `(dirName)/route` children (the group segment STAYS in the
 * navigator route name); then standalone screens. Every emitted name must
 * match a root child's `route` exactly — getSortedChildren matches
 * `route.route === name`, and a wrong anchor would throw at startup
 * (layoutAnchor.readAnchor: 'The initial route name … was not found').
 */
function computeRootEntries(data: ProjectData): string[] {
  const entries: string[] = []
  for (const group of sortedGroups(data)) {
    const screens = screensInBucket(data, group.id)
    if (group.nav.kind === 'none') {
      for (const s of screens) entries.push(`(${group.dirName})/${s.route}`)
      continue
    }
    if (screens.length > 0) entries.push(`(${group.dirName})`)
  }
  for (const s of screensInBucket(data, null)) entries.push(s.route)
  return entries
}

/* ────────────────────────────────────────────────────────────────────────────
 * Code tab tree
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Build the Code tab tree from a generated file map. Directories come before
 * files, both alphabetical by segment ('(auth)' < '(main)'; '_layout.tsx'
 * sorts ahead of lowercase route files — layout first, matching expo-router
 * convention). File nodes carry their contents for the viewer pane.
 */
export function codegenFileList(files: Map<string, string>): FileTreeNode[] {
  const root: FileTreeNode = { name: '', path: '', type: 'dir', children: [] }
  for (const [path, content] of files) insertPath(root, path, content)
  sortTree(root)
  return root.children
}

function insertPath(root: FileTreeNode, path: string, content: string): void {
  const segs = path.split('/').filter((s) => s.length > 0)
  if (segs.length === 0) return
  let cur = root
  const acc: string[] = []
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    acc.push(seg)
    if (i === segs.length - 1) {
      cur.children.push({ name: seg, path: acc.join('/'), type: 'file', content, children: [] })
      return
    }
    let next = cur.children.find((c) => c.type === 'dir' && c.name === seg)
    if (!next) {
      next = { name: seg, path: acc.join('/'), type: 'dir', children: [] }
      cur.children.push(next)
    }
    cur = next
  }
}

function sortTree(node: FileTreeNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
  for (const c of node.children) sortTree(c)
}
