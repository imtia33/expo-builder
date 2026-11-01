# Task 10-F — Editor Shell + Toolbar (ExpoForge visual builder rework)

Owner: `src/components/builder/shell/**`, `src/components/builder/toolbar/**`, `src/app/theme/**` (toolbar/topbar-related only).

## What landed

### TopBar (shell/top-bar.tsx) — full rewrite
- New contract: `interface TopBarProps { onHelp: () => void; className?: string }`. Everything else from `useProjectStore`.
- Cluster 1 (left): `ph:lightning` logo (accent) + wordmark, ghost inline project-name input (commits blur/Enter → `setProjectName`, Esc reverts+blurs with an escape-guard so the synthetic blur never commits), autosave chip (`ph:floppy-disk` + "Saved" — honest: zustand persist is synchronous localStorage).
- Cluster 2+3 (center-right, left group flex-[2] / right flex-[1]): platform segmented control (`ph:apple-logo` iOS / `ph:android-logo` Android, theme size `top`) — acts on the ACTIVE screen (`setScreenPlatform`, which also records `ui.lastPlatform`); with no active screen it writes `ui.lastPlatform` via `useProjectStore.setState` (store has no action for this — see gaps). Never disabled during sim. Then Sim: `ph:play` "Simulate" ⇄ `ph:stop` "Stop" (bg-accent → bg-error-fill), disabled when `data.screens.length === 0` with Tip "Add a screen first", calls `setSim(!on)`; pulsing "SIMULATING" chip while on (motion-reduce aware).
- Cluster 4+5 (right): Undo (`ph:arrow-counter-clockwise`) / Redo (`ph:arrow-clockwise`) — disabled from `past.length`/`future.length`, tooltips via `formatShortcut` — then Help (`ph:keyboard`) → `onHelp`.
- Bar surface: `h-10 bg-panel border-b border-border`. No zoom controls.

### Bottom pill (toolbar/builder-toolbar.tsx) — tools only
- New contract: `BuilderToolbarProps { tool: ToolbarTool; onToolChange: (t: ToolbarTool) => void; className? }` where `ToolbarTool = 'select' | 'hand' | InsertTool` (InsertTool from lib/project/types).
- Groups: `[Select V ph:cursor · Hand H ph:hand-grabbing] | [Screen S ph:device-mobile] | [registry pill: Text T ph:text-t · View B ph:square · Button ph:cursor-click · Input(textinput) I ph:cursor-text · Image ph:image] | [More ph:dots-three]`.
- More flyout = single trigger (dots-three, highlighted while a member is active); members per `REGISTRY_FLYOUT_ORDER`: switch `ph:toggle-right`, divider `ph:minus`, lineargradient `ph:gradient` "Linear gradient", blurview `ph:drop-half-bottom` "Blur view", activityindicator `ph:spinner-gap` "Activity indicator". Radio check = active member, else remembered (flyout memory).
- Registry-driven + existence-gated: `getEntry(type)` missing → type skipped (and its divider/whole flyout hidden while empty). Labels = `entry.name` (spec-verbatim overrides for the three above); icons from a curated spec-verified table. Today only text+view entries exist, so the pill renders Select/Hand/Screen/Text/View; the rest appears as the registry task lands.
- `scrollview` is in REGISTRY_TOOL_ORDER but not in the spec's pill list → palette-only for now (one-line add in `PILL_ORDER` if wanted).
- Clicking the active tool does NOT deselect; placement tools stay highlighted until the parent resets to 'select'.
- Kept: roving tabindex, reduced motion (entrance 150ms/8px), Tip tooltips, pill surface (rounded-xl bg-panel p-1 shadow).

### Shortcuts & help (shell/)
- `use-builder-shortcuts`: added `$mod+Z` / `$mod+Shift+Z` / `$mod+Y` → store undo/redo (guards already skip editable focus/open layers). Kept `$mod+\` (chrome), `$mod+0`/`$mod+1`/`Shift+Digit1` zoom reservations, `[Shift]+?` help. No Delete/Escape bindings (canvas-owned).
- `keyboard-help`: SHORTCUT_GROUPS regenerated → Tools (V/H/S/T/B/I), History (⌘Z, ⌘⇧Z/⌘Y), Canvas (⌘0/⌘1/⇧1 — implemented in page.tsx), Interface (⌘\, ?).
- workspace-layout: comment touch-up only (top-bar row height is content-sized, nothing hardcoded).

## Files
- Rewrote: shell/top-bar.tsx, shell/index.ts (dropped SaveState), shell/use-builder-shortcuts.ts, shell/keyboard-help.tsx (content), shell/workspace-layout.tsx (comment), toolbar/tool-registry.ts, toolbar/tool-button.tsx (Iconify icons, overridable aria), toolbar/tool-flyout.tsx (single trigger), toolbar/use-flyout-selections.ts, toolbar/use-toolbar-shortcuts.ts, toolbar/builder-toolbar.tsx, toolbar/index.ts.
- Deleted: toolbar/zoom-dropdown.tsx, toolbar/platform-toggle.tsx.
- Theme: toolbar.ts (trimmed to used slots; active/hover compound preserved), select/segmented-control.ts (added size `top`). `tab-bar.ts` is now unused — left untouched.

## Shortcut map
V Select · H Hand · S Screen placement · T Text · B View · I Input (binding appears when the textinput entry lands) · ⌘Z undo · ⌘⇧Z/⌘Y redo · ⌘0/⌘1/⇧1 zoom (page-owned) · ⌘\ toggle UI · ? help. Button/Image/all flyout tools: shortcut-less per spec.

## Store API gaps (report-only)
1. No action to set `ui.lastPlatform` without a screen — TopBar works around it with `useProjectStore.setState((s) => ({ ui: { ...s.ui, lastPlatform } }))`. A `setLastPlatform(platform)` action would be cleaner.
2. Nothing else — setProjectName/setSim/setScreenPlatform/undo/redo/past/future/revision/activeScreenId/screens/ui.lastPlatform all sufficient.

## page.tsx integration needs (for the integration task)
- `<TopBar onHelp={() => setHelpOpen(true)} />`
- `<BuilderToolbar tool={tool} onToolChange={setTool} />` with `import { type ToolbarTool } from '@/components/builder/toolbar'`; parent resets to `'select'` after the canvas places. Note: page.tsx currently 500s on other in-flight modules (left-panel stub-data, right-panel code-tab) — same integration pass must fix those imports.

## Verification
- `bunx tsc --noEmit`: clean for all owned dirs (only pre-existing/in-flight errors elsewhere: page.tsx contract, left/right-panel, canvas/measure, dialogs, lib/codegen, examples/skills).
- `bun run lint`: no findings in owned dirs (only remaining project error is canvas/measure.ts, another task).
- All 25 Phosphor names verified against `@iconify-json/ph` (icons+aliases), including ph:check.
