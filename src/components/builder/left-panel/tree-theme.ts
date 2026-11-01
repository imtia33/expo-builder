/**
 * Hierarchy-tree row anatomy — a local tailwind-variants theme adapting the
 * ported `layer-tree` / `page-list` themes to the three row kinds (group,
 * screen, layer). Kept inside the left panel (theme files under src/app/theme
 * are shared surfaces owned elsewhere).
 *
 * Two-state selection follows the open-pencil pattern: while the panel holds
 * focus the selected row is `bg-panel-selected text-on-accent`; once focus
 * leaves the panel (e.g. to the canvas) it dims to `bg-panel-selected-muted`.
 */
const hierarchyTreeTheme = {
  slots: {
    viewport: 'scrollbar-thin relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1 pb-1',
    row: 'group/row relative flex h-6 w-full cursor-pointer items-center gap-1 rounded border-none bg-transparent pr-1.5 text-left text-[11px] text-surface outline-none hover:bg-hover',
    chevron:
      'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-current outline-none transition-transform hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-panel-focus',
    chevronSpacer: 'size-4 shrink-0',
    icon: 'size-3 shrink-0',
    label: 'flex min-w-0 flex-1 items-center gap-1 text-left',
    secondary: 'min-w-0 shrink-0 truncate text-[10px] text-muted',
    countBadge:
      'flex h-3.5 min-w-3.5 shrink-0 items-center justify-center rounded-full bg-panel-field px-1 text-[9px] leading-none text-muted tabular-nums',
    /** Screen trailing chips (platform + device); yields to hover actions. */
    chips: 'flex shrink-0 items-center gap-1 text-[10px] text-muted group-hover/row:hidden',
    actions: 'flex shrink-0 items-center gap-0.5',
    action:
      'flex size-4 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-current outline-none hover:bg-white/15 focus-visible:ring-1 focus-visible:ring-panel-focus',
    actionIcon: 'size-3',
    renameInput:
      'h-4 min-w-0 flex-1 rounded border border-accent bg-input px-1 text-[11px] text-surface outline-none',
    dropIndicator: 'pointer-events-none absolute bg-accent',
    divider: 'my-1 flex h-4 items-center gap-1.5 px-2',
    dividerLine: 'h-px flex-1 bg-border',
    /** Bottom drop target that turns a dragged screen standalone. */
    dropZone: 'flex h-7 items-center gap-1.5 rounded border border-dashed px-2 text-[10px] outline-none',
    emptyIcon: 'size-6 text-muted opacity-70'
  },
  variants: {
    selected: {
      true: { row: 'bg-panel-selected text-on-accent hover:bg-panel-selected' },
      false: { row: 'bg-transparent text-surface hover:bg-hover' }
    },
    focused: {
      true: {},
      false: {}
    },
    dragging: {
      true: { row: 'opacity-30' },
      false: {}
    },
    /** Hidden layers dim; the row is skipped when selected (only the icon fades). */
    dimmed: {
      true: { row: 'opacity-60' },
      false: {}
    },
    expanded: {
      true: { chevron: 'rotate-90' },
      false: { chevron: 'rotate-0' }
    },
    /** The row is the live target of an 'inside' drop (container tint). */
    insideTarget: {
      true: { row: 'bg-accent/15 text-surface' },
      false: {}
    },
    dropPosition: {
      above: { dropIndicator: 'inset-x-1 top-0 h-0.5 rounded-full' },
      below: { dropIndicator: 'inset-x-1 bottom-0 h-0.5 rounded-full' },
      inside: { dropIndicator: 'inset-y-0.5 inset-x-0.5 rounded border border-accent bg-accent/10' }
    },
    /** Hover actions stay hidden until the row is hovered / focused within. */
    actionsVisible: {
      true: {},
      false: { actions: 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100' }
    },
    actionActive: {
      true: { actionIcon: 'opacity-100' },
      false: {
        actionIcon: 'opacity-0 group-hover/row:opacity-70 group-focus-within/row:opacity-70'
      }
    },
    dropZoneActive: {
      true: { dropZone: 'border-accent bg-accent/10 text-surface' },
      false: { dropZone: 'border-border text-muted' }
    }
  },
  compoundVariants: [
    {
      selected: true,
      focused: false,
      class: { row: 'bg-panel-selected-muted text-surface hover:bg-panel-selected-muted' }
    },
    // A hidden layer dims; when selected the highlight must stay solid, so only the icon fades.
    { dimmed: true, selected: false, class: {} },
    { dimmed: true, selected: true, class: { icon: 'opacity-50' } }
  ],
  defaultVariants: {
    selected: false,
    focused: false,
    dragging: false,
    dimmed: false,
    expanded: false,
    insideTarget: false,
    actionsVisible: false,
    actionActive: false,
    dropZoneActive: false
  }
}

export type HierarchyTreeTheme = typeof hierarchyTreeTheme
export default hierarchyTreeTheme
