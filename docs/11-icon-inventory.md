# Icon Inventory — the complete list of icons the editor needs

**You said you'd provide a better icon set. This is the list to fill.**

Every icon in the editor renders through ONE registry: `src/components/builder/icons/slots.tsx`.
No component anywhere references an icon by name — they reference a semantic **slot**, and the slot maps to an icon. Replacing the entire icon set is a one-file change: edit the `ICON_SLOTS` table at the top of that file.

```ts
// current example — swap the value, keep the key
'tool.select': 'ph:cursor',   // ← your icon here
```

**Two ways to hand me your icons:**

1. **By name from an installed Iconify collection** — e.g. if you pick a set like Lucide/Tabler/Heroicons, give me the collection prefix + names (`lucide:mouse-pointer-2`), I add the collection and update the table.
2. **Custom SVGs** — drop the SVG files on me; I'll turn them into a local collection with the same slot names.

---

## Conventions worth keeping

- The set renders at **10–20px** — glyphs must stay legible at 12px. Avoid detail-heavy icons.
- Mixed stroke/fill sets look inconsistent in a dense tool UI; a uniform style (like Phosphor's regular weight) reads best.
- Some slots are **paired** (visible/hidden, play/stop, iOS/Android, stepper +/-) — your set should have natural pairs.
- `platform.ios` / `platform.android` are brand glyphs; anything recognizable works (apple / robot).

## Sizes (all fixed square, set per usage)

| Context | px |
|---|---|
| Top bar (undo/redo/save/platform/sim) | 12–14 |
| Bottom toolbar tools | 14–16 |
| Tree rows (groups/screens/layers/actions) | 12 |
| Inspector tabs / section headers | 12–14 |
| Dialogs | 12–16 |
| Canvas chrome (group frames, empty state) | 12–24 |

---

## The slots (86 total)

### Tools — bottom toolbar (15)
| Slot | Current glyph | Meaning |
|---|---|---|
| `tool.select` | `ph:cursor` | Select/pointer tool (V) |
| `tool.hand` | `ph:hand-grabbing` | Pan/hand tool (H) |
| `tool.screen` | `ph:device-mobile` | New-screen placement tool (S) |
| `tool.text` | `ph:text-t` | Place a Text node (T) |
| `tool.view` | `ph:square` | Place a View container (B) |
| `tool.textinput` | `ph:cursor-text` | Place a TextInput (I) |
| `tool.button` | `ph:cursor-click` | Place a Button |
| `tool.image` | `ph:image` | Place an Image |
| `tool.scrollview` | `ph:mouse-scroll` | Place a ScrollView |
| `tool.switch` | `ph:toggle-right` | Place a Switch |
| `tool.divider` | `ph:minus` | Place a Divider |
| `tool.lineargradient` | `ph:gradient` | Place a LinearGradient |
| `tool.blurview` | `ph:drop-half-bottom` | Place a BlurView |
| `tool.activityindicator` | `ph:spinner-gap` | Place an ActivityIndicator |
| `tool.more` | `ph:dots-three` | "More tools" flyout trigger |

> `tool.*` slots double as the **layer-row glyphs** in the tree — one component reads as one glyph everywhere.

### Hierarchy tree — left panel (13)
| Slot | Current glyph | Meaning |
|---|---|---|
| `tree.collapse` | `ph:caret-right` | Expand/collapse chevron (rotates 90° when open) |
| `tree.group.tabs` | `ph:squares-four` | Tabs-navigator group row |
| `tree.group.stack` | `ph:stack` | Stack-navigator group row |
| `tree.group.none` | `ph:rows` | Plain (no-navigator) group row |
| `tree.screen` | `ph:device-mobile` | Screen row |
| `tree.layer` | `ph:square` | Fallback layer glyph for unregistered types |
| `tree.add-screen` | `ph:plus` | "Add screen to group" hover action |
| `tree.inspect` | `ph:gear-six` | "Select group" hover action |
| `tree.delete` | `ph:trash-simple` | Delete hover action (rows) |
| `tree.visible` | `ph:eye` | Layer shown |
| `tree.hidden` | `ph:eye-slash` | Layer hidden (pair of `tree.visible`) |
| `tree.empty-groups` | `ph:stack` | Empty-state illustration glyph |
| `tree.new-screen` | `ph:device-mobile` | Empty-state "new screen" button |

### Left panel header (4)
| Slot | Current glyph | Meaning |
|---|---|---|
| `panel.new` | `ph:plus` | "Add group or screen" menu trigger |
| `panel.new-group` | `ph:folder-plus` | New group… |
| `panel.new-screen` | `ph:file-plus` | New screen |
| `panel.search` | `ph:magnifying-glass` | Filter box leading glyph |

### Platform & simulation — top bar (4)
| Slot | Current glyph | Meaning |
|---|---|---|
| `platform.ios` | `ph:apple-logo` | iOS target (THE global toggle) |
| `platform.android` | `ph:android-logo` | Android target (pair of `platform.ios`) |
| `sim.start` | `ph:play` | Start simulation |
| `sim.stop` | `ph:stop` | Stop simulation (pair of `sim.start`) |

### Top bar chrome (5)
| Slot | Current glyph | Meaning |
|---|---|---|
| `brand.logo` | `ph:lightning` | ExpoForge logo mark |
| `topbar.saved` | `ph:floppy-disk` | Autosaved chip |
| `topbar.undo` | `ph:arrow-counter-clockwise` | Undo |
| `topbar.redo` | `ph:arrow-clockwise` | Redo (mirror of `topbar.undo`) |
| `topbar.help` | `ph:keyboard` | Keyboard shortcuts |

### Inspector — right panel (24)
| Slot | Current glyph | Meaning |
|---|---|---|
| `inspector.tab-props` | `ph:sliders-horizontal` | Properties tab |
| `inspector.tab-style` | `ph:paint-brush` | Style tab |
| `inspector.tab-screen` | `ph:device-mobile` | Screen tab |
| `inspector.tab-nav` | `ph:squares-four` | Navigation tab |
| `inspector.tab-code` | `ph:code` | Code tab |
| `inspector.tab-project` | `ph:cube` | Project tab |
| `inspector.section-collapse` | `ph:caret-right` | Section chevron (rotates 90°) |
| `inspector.section-reset` | `ph:arrow-counter-clockwise` | Reset section to defaults |
| `inspector.link-chains` | `ph:link` | Linked X/Y or W/H toggle |
| `inspector.check` | `ph:check` | Selected state (menus, selects, copy-done) |
| `inspector.chevron-down` | `ph:caret-down` | Select/combobox trigger |
| `inspector.file-code` | `ph:file-code` | File rows in the code picker |
| `inspector.copy` | `ph:copy` | Copy file |
| `inspector.close` | `ph:x` | Close (reserved) |
| `inspector.animation` | `ph:sparkle` | Animation section (reserved) |
| `inspector.play` | `ph:play` | Animation preview play (reserved) |
| `inspector.pause` | `ph:pause` | Animation preview pause (reserved) |
| `inspector.replay` | `ph:arrow-counter-clockwise` | Animation replay (reserved) |
| `inspector.code-controlled` | `ph:code` | Code-controlled property badge (reserved) |
| `inspector.folder-new` | `ph:folder-plus` | "Start building" hint |
| `inspector.project-grid` | `ph:grid-four` | Tabs nav kind meta |
| `inspector.project-layers` | `ph:stack` | Navigation overview header |
| `inspector.project-routes` | `ph:route` | Routes header |
| `inspector.project-rows` | `ph:rows` | None nav kind meta |
| `inspector.project-stack` | `ph:square-stack` | Stack nav kind meta |

### Dialogs (8)
| Slot | Current glyph | Meaning |
|---|---|---|
| `dialog.close` | `ph:x` | Dialog close |
| `dialog.radio-check` | `ph:check` | Selected radio (inside an accent dot) |
| `dialog.nav.tabs` | `ph:squares-four` | Tabs card (New group dialog) |
| `dialog.nav.stack` | `ph:stack` | Stack card |
| `dialog.nav.none` | `ph:rows` | None card |
| `dialog.stepper-minus` | `ph:minus` | Screen-count stepper − |
| `dialog.stepper-plus` | `ph:plus` | Screen-count stepper + |
| `dialog.create` | `ph:plus` | "Create group" submit |

### Canvas chrome (8)
| Slot | Current glyph | Meaning |
|---|---|---|
| `canvas.empty-phone` | `ph:device-mobile` | Empty-canvas illustration |
| `canvas.empty-plus` | `ph:plus` | "New screen" empty-state button |
| `canvas.group.tabs` | `ph:squares-four` | Group frame title chip (tabs) |
| `canvas.group.stack` | `ph:stack` | Group frame title chip (stack) |
| `canvas.group.none` | `ph:rows` | Group frame title chip (none) |
| `canvas.stack-back` | `ph:caret-left` | Sim back chevron (stack header) |
| `canvas.show-ui` | `ph:sidebar-simple` | "Show interface" chip (narrow layout) |
| `canvas.wide-notice` | `ph:monitor` | Needs-a-wider-window notice |

### Device status bar — artboard chrome (3)
| Slot | Current glyph | Meaning |
|---|---|---|
| `statusbar.signal` | `ph:cell-signal-full` | Fake status-bar signal |
| `statusbar.wifi` | `ph:wifi-high` | Fake status-bar wifi |
| `statusbar.battery` | `ph:battery-full` | Fake status-bar battery |

---

## What is NOT part of this inventory

- **Icons inside the app you're building** (tab bar icons etc.) come from the **Phosphor set via the icon picker** and ship in the generated project — they're app content, not editor chrome. The user-facing app icon set is a separate decision.
- The generated `CustomTabBar` imports icons from `phosphor-react-native` — also app content.

## Notes on reuse

Several slots intentionally share a glyph today (`plus`, `check`, `caret-right`, `device-mobile`, the nav trio). Keep them as separate slots even if your set reuses glyphs — the slots are semantic, and future divergence is a one-line change.
