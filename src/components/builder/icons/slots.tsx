/*
 * Editor icon slots — THE single registry of every icon the editor UI needs.
 *
 * Why: the editor previously mixed two icon systems (Iconify/Phosphor name
 * strings + lucide-react components) with inconsistent glyphs for the same
 * concept. Every editor surface now renders icons through <SlotIcon slot="…"/>,
 * so replacing the entire icon set is a one-file change: swap the mapping
 * below. The values are currently Phosphor names rendered offline through
 * @iconify-json/ph (see ./index.tsx).
 *
 * Slot naming: `<area>.<semantic>`, e.g. 'tool.select', 'tree.collapse'.
 * This file is also the ICON INVENTORY the user replaces with a custom set —
 * every slot needs exactly one icon (see docs/11-icon-inventory.md).
 */
import { IconifyIcon } from './index'

export const ICON_SLOTS = {
  /* ── tools (bottom toolbar) ──────────────────────────────────────────── */
  'tool.select': 'ph:cursor',
  'tool.hand': 'ph:hand-grabbing',
  'tool.screen': 'ant-design:mobile-filled',
  'tool.text': 'andrsrxn:text-case-sensitive',
  'tool.view': 'codicon:screen-full',
  'tool.textinput': 'reicon:text-input-focus',
  'tool.button': 'tabler:hand-click',
  'tool.image': 'akar-icons:image',
  'tool.scrollview': 'ph:mouse-scroll',
  'tool.switch': 'ph:toggle-right',
  'tool.divider': 'ph:minus',
  'tool.lineargradient': 'ph:gradient',
  'tool.blurview': 'ph:drop-half-bottom',
  'tool.activityindicator': 'ph:spinner-gap',
  'tool.more': 'ph:dots-three',

  /* ── hierarchy tree (left panel) ─────────────────────────────────────── */
  'tree.collapse': 'ph:caret-right',
  'tree.group.tabs': 'iconmind:navbar-duotone-thin',
  'tree.group.stack': 'f7:square-stack-3d-down-right',
  'tree.group.none': 'ph:rows',
  'tree.screen': 'ant-design:mobile-filled',
  'tree.layer': 'ph:square',
  'tree.add-screen': 'ph:plus',
  'tree.inspect': 'ph:gear-six',
  'tree.delete': 'ph:trash-simple',
  'tree.visible': 'ph:eye',
  'tree.hidden': 'ph:eye-slash',
  'tree.empty-groups': 'ph:stack',
  'tree.new-screen': 'ant-design:mobile-filled',

  /* ── left panel header / menus ───────────────────────────────────────── */
  'panel.new': 'ph:plus',
  'panel.new-group': 'ph:folder-plus',
  'panel.new-screen': 'ph:file-plus',
  'panel.search': 'ph:magnifying-glass',

  /* ── platform / theme / simulation (top bar) ─────────────────────────── */
  'platform.ios': 'ph:apple-logo',
  'platform.android': 'ph:android-logo',
  'theme.light': 'ph:sun',
  'theme.dark': 'ph:moon',
  'sim.start': 'ph:play',
  'sim.stop': 'ph:stop',

  /* ── top bar chrome ──────────────────────────────────────────────────── */
  'brand.logo': 'ph:lightning',
  'topbar.saved': 'ph:floppy-disk',
  'topbar.undo': 'ph:arrow-counter-clockwise',
  'topbar.redo': 'ph:arrow-clockwise',
  'topbar.help': 'ph:keyboard',

  /* ── inspector (right panel) ─────────────────────────────────────────── */
  'inspector.tab-props': 'ph:sliders-horizontal',
  'inspector.tab-style': 'ph:paint-brush',
  'inspector.tab-screen': 'ph:device-mobile',
  'inspector.tab-nav': 'ph:squares-four',
  'inspector.tab-code': 'ph:code',
  'inspector.tab-project': 'ph:cube',
  'inspector.section-collapse': 'ph:caret-right',
  'inspector.section-reset': 'ph:arrow-counter-clockwise',
  'inspector.link-chains': 'ph:link',
  'inspector.check': 'ph:check',
  'inspector.chevron-down': 'ph:caret-down',
  'inspector.file-code': 'ph:file-code',
  'inspector.copy': 'ph:copy',
  'inspector.close': 'ph:x',
  'inspector.animation': 'ph:sparkle',
  'inspector.play': 'ph:play',
  'inspector.pause': 'ph:pause',
  'inspector.replay': 'ph:arrow-counter-clockwise',
  'inspector.code-controlled': 'ph:code',
  'inspector.folder-new': 'ph:folder-plus',
  'inspector.project-grid': 'ph:grid-four',
  'inspector.project-layers': 'ph:stack',
  'inspector.project-routes': 'ph:route',
  'inspector.project-rows': 'ph:rows',
  'inspector.project-stack': 'ph:square-stack',

  /* ── dialogs ─────────────────────────────────────────────────────────── */
  'dialog.close': 'ph:x',
  'dialog.radio-check': 'ph:check',
  'dialog.nav.tabs': 'iconmind:navbar-duotone-thin',
  'dialog.nav.stack': 'f7:square-stack-3d-down-right',
  'dialog.nav.none': 'ph:rows',
  'dialog.stepper-minus': 'ph:minus',
  'dialog.stepper-plus': 'ph:plus',
  'dialog.create': 'ph:plus',

  /* ── canvas chrome ───────────────────────────────────────────────────── */
  'canvas.empty-phone': 'ph:device-mobile',
  'canvas.empty-plus': 'ph:plus',
  'canvas.group.tabs': 'iconmind:navbar-duotone-thin',
  'canvas.group.stack': 'f7:square-stack-3d-down-right',
  'canvas.group.none': 'ph:rows',
  'canvas.stack-back': 'ph:caret-left',
  'canvas.show-ui': 'ph:sidebar-simple',
  'canvas.wide-notice': 'ph:monitor',

  /* ── device status bar (artboard chrome) ─────────────────────────────── */
  'statusbar.signal': 'ph:cell-signal-full',
  'statusbar.wifi': 'ph:wifi-high',
  'statusbar.battery': 'ph:battery-full'
} as const

export type IconSlot = keyof typeof ICON_SLOTS

export interface SlotIconProps {
  slot: IconSlot
  className?: string
  /** Fixed square size in px (DOM). */
  size?: number
  'aria-hidden'?: boolean | 'true' | 'false'
}

/** Render an editor icon by semantic slot — never by raw icon name. */
export function SlotIcon({ slot, className, size, ...rest }: SlotIconProps) {
  return <IconifyIcon icon={ICON_SLOTS[slot]} className={className} width={size} height={size} {...rest} />
}
