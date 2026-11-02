'use client'
/*
 * ScreenTreePreview — renders one screen's node tree with react-native-web
 * inside the canvas device frame. This is the LIVE half of the preview
 * contract; the DOM half (tab bar / stack header chrome) lives in
 * ./tab-bar.tsx and ./stack-header.tsx.
 *
 * Hit-testing contract: every rendered node carries `testID={node.id}`, which
 * RNW maps to `data-testid` on the DOM node (see NODE_DOM_ATTR). The canvas
 * resolves clicks by walking up from the event target to the nearest
 * `[data-testid]` ancestor and selecting that node. The screen ROOT View
 * deliberately carries NO testID (it is not a node).
 *
 * RN rules honored here: no DOM/HTML and no Iconify inside RNW trees — text
 * children are plain strings; every prop below exists on the RNW 0.21.4 API
 * (verified against node_modules/react-native-web/dist/exports/*).
 */
import { Fragment, createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Button,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  SectionList,
  Switch,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  View,
  type StyleRecord
} from 'react-native-web'

import type { PlatformId } from '@/components/builder/screens/device-presets'
import type { ProjectNode, Screen } from '@/lib/project/types'
import { getEntry, resolveImplementation } from '../registry'
import { resolveNode, textPropField, textPropValue } from './resolve'
import {
  bindingPreviewValue,
  isItemBinding,
  listItems,
  listSections,
  roleOfNode,
  type ListItem
} from '@/lib/lists/bindings'
import { fireInteraction, type PreviewNav } from '@/lib/interactions/resolve'
import { resolveStateValues, statePreviewValue } from '@/lib/state/screen-state'

/* ────────────────────────────────────────────────────────────────────────────
 * Child index (flat node map → per-parent ordered lists)
 * ──────────────────────────────────────────────────────────────────────────── */

type ChildIndex = Map<string | null, ProjectNode[]>

function buildChildIndex(nodes: Record<string, ProjectNode>, screenId: string): ChildIndex {
  const index: ChildIndex = new Map()
  for (const id in nodes) {
    const node = nodes[id]
    if (node.screenId !== screenId) continue
    const siblings = index.get(node.parentId)
    if (siblings) siblings.push(node)
    else index.set(node.parentId, [node])
  }
  for (const siblings of index.values()) siblings.sort((a, b) => a.order - b.order)
  return index
}

/* ────────────────────────────────────────────────────────────────────────────
 * Small coercion helpers (registry props are `unknown`; be forgiving)
 * ──────────────────────────────────────────────────────────────────────────── */

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function asInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value)
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Math.round(Number(value))
  }
  return undefined
}

/** Float number guard (activeOpacity etc. — no rounding). */
function asFloat(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value)
  }
  return undefined
}

function asColor(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** Enum guard — returns the value only when it is one of the allowed literals. */
function asEnum<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const KEYBOARD_TYPES = [
  'default',
  'number-pad',
  'decimal-pad',
  'email-address',
  'phone-pad',
  'ascii-capable',
  'numbers-and-punctuation',
  'url'
] as const

const RETURN_KEY_TYPES = ['done', 'go', 'next', 'search', 'send'] as const

const AUTO_CAPITALIZE = ['none', 'sentences', 'words', 'characters'] as const

/* ────────────────────────────────────────────────────────────────────────────
 * Button variant presets — the shared visual contract for the 'button'
 * composite (documented in registry/data/button.ts previewNote so codegen
 * can emit the same look; node style always wins).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ButtonVariantPreset {
  box: StyleRecord
  label: StyleRecord
}

const BUTTON_BOX_BASE: StyleRecord = {
  alignItems: 'center',
  justifyContent: 'center'
}

export const BUTTON_VARIANT_BASE: Record<string, ButtonVariantPreset> = {
  primary: {
    box: { ...BUTTON_BOX_BASE, backgroundColor: '#111827', borderRadius: 8 },
    label: { color: '#FFFFFF' }
  },
  secondary: {
    box: { ...BUTTON_BOX_BASE, backgroundColor: '#F3F4F6', borderRadius: 8 },
    label: { color: '#111827' }
  },
  ghost: {
    box: { ...BUTTON_BOX_BASE },
    label: { color: '#111827' }
  }
}

/**
 * Typography-relevant style keys — lifted off the box style and applied to a
 * button's inner label Text instead (they are no-ops on a View anyway).
 */
const TYPOGRAPHY_STYLE_KEYS: ReadonlySet<string> = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textTransform',
  'textDecorationLine',
  'textShadowColor',
  'textShadowOffset',
  'textShadowRadius'
])

function splitTypographyStyle(style: Record<string, unknown>): {
  box: Record<string, unknown>
  label: Record<string, unknown>
} {
  const box: Record<string, unknown> = {}
  const label: Record<string, unknown> = {}
  for (const key in style) {
    if (TYPOGRAPHY_STYLE_KEYS.has(key)) label[key] = style[key]
    else box[key] = style[key]
  }
  return { box, label }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Image helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** 1×1 transparent GIF — a valid always-loadable source so RNW renders a real
 * <img>; with no user URI the placeholder background color shows through. */
const ONE_PIXEL_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const IMAGE_PLACEHOLDER_BG = '#E5E7EB'

/** expo-image `contentFit` → RNW Image `resizeMode` ('fill' → 'stretch'). */
const CONTENT_FIT_TO_RESIZE_MODE: Record<string, 'cover' | 'contain' | 'stretch' | 'center' | 'none'> = {
  cover: 'cover',
  contain: 'contain',
  fill: 'stretch',
  center: 'center',
  none: 'none'
}

/** react-native Image `resizeMode` values (all valid RNW style values). */
const RESIZE_MODES = ['cover', 'contain', 'stretch', 'center', 'repeat'] as const

/* ────────────────────────────────────────────────────────────────────────────
 * Interaction runtime (Phase 4, P0-1)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The artboard provides the sim nav runtime (simNavigate/simBack on the
 * per-artboard history) through context when Sim mode is on; PreviewNode
 * consumes it wherever a registry hook is wired. Context — not another
 * threaded prop — because the tree recursion (list templates included)
 * already carries childIndex/platform/binding.
 */
const PreviewNavContext = createContext<PreviewNav | null>(null)

/** Fire a node's wired hook, resolving against the CURRENT project (the
 * store is read at click time, so a deleted target screen unwires live). */
function useWiredHook(hook: string, node: ProjectNode): (() => void) | undefined {
  const nav = useContext(PreviewNavContext)
  return useMemo(() => {
    if (!nav) return undefined
    return () => fireInteraction(hook, node, useProjectStore.getState().data, nav)
  }, [nav, hook, node])
}

/* ────────────────────────────────────────────────────────────────────────────
 * Node renderer — per-type RNW mapping
 * ──────────────────────────────────────────────────────────────────────────── */

import { useProjectStore } from '@/lib/project/store'
import { applyPaints, isGradientPaint, paletteResolver, paintSwatchBackground } from '@/lib/paint'

interface PreviewNodeProps {
  node: ProjectNode
  childIndex: ChildIndex
  platform: PlatformId
  /**
   * Phase 2 list binding: the current data row (or section record) while
   * rendering a repeated item template / section header. Text content and
   * Image source may hold {item.…}/{section.…} — substituted per row here,
   * exactly as the code emitter produces them (lib/lists/bindings is the one
   * resolver both consume).
   */
  binding?: unknown
}

function renderChildNodes(
  parentId: string,
  childIndex: ChildIndex,
  platform: PlatformId,
  binding?: unknown
): ReactNode[] {
  return (childIndex.get(parentId) ?? []).map((child) => (
    <PreviewNode key={child.id} node={child} childIndex={childIndex} platform={platform} binding={binding} />
  ))
}

/* ─────────────────────────────────────────────────────────────────────────────
 * List composition (Phase 2)
 * ───────────────────────────────────────────────────────────────────────────── */

/** A list's direct children split by the role they play. */
function partitionByRole(siblings: ProjectNode[]): { item: ProjectNode[]; header: ProjectNode[]; footer: ProjectNode[]; separator: ProjectNode[]; empty: ProjectNode[] } {
  const out = { item: [] as ProjectNode[], header: [] as ProjectNode[], footer: [] as ProjectNode[], separator: [] as ProjectNode[], empty: [] as ProjectNode[] }
  for (const child of siblings) out[roleOfNode(child)].push(child)
  return out
}

/** Render the once-per-list chrome (header/footer/separator/empty) — never
 * per-row: bindings inside them resolve to their raw {item.…} text, the
 * honest signal that they are not row context. */
function renderListChrome(nodes: ProjectNode[], childIndex: ChildIndex, platform: PlatformId): ReactElement | null {
  return <Fragment>{renderChildNodesFor(nodes, childIndex, platform)}</Fragment>
}

function renderChildNodesFor(nodes: ProjectNode[], childIndex: ChildIndex, platform: PlatformId): ReactNode[] {
  return nodes.map((child) => (
    <PreviewNode key={child.id} node={child} childIndex={childIndex} platform={platform} />
  ))
}

function PreviewNode({ node, childIndex, platform, binding }: PreviewNodeProps): ReactNode {
  /* Paint resolution (Phase 1): theme tokens bind to the project palette,
   * gradients (backgroundColor) become RNW CSS backgroundImage. Subscribing
   * here means palette edits + light/dark toggles re-render the tree. Hooks
   * run BEFORE the early returns below (rules of hooks — hidden/unknown
   * nodes must not change the hook count). */
  const palette = useProjectStore((s) => s.data.theme?.colors)
  const themeMode = useProjectStore((s) => s.ui.themeMode)
  /* Screen state (Phase 4 slice 2): the node's own screen's effective values
   * (declared initials overlaid with live sim values). Stable selectors +
   * pure merge — never a fresh object from the selector itself. */
  const screensArr = useProjectStore((s) => s.data.screens)
  const simValues = useProjectStore((s) => s.sim.values)
  const stateValues = useMemo(
    () => resolveStateValues(screensArr.find((s) => s.id === node.screenId), simValues?.[node.screenId]),
    [screensArr, simValues, node.screenId]
  )
  /* Wired onPress (Phase 4, P0-1): resolved for every node (rules of hooks —
   * unconditional), consumed only by components whose registry declares the
   * hook (button today). Undefined in edit mode or when unwired. */
  const wiredPress = useWiredHook('onPress', node)

  // Hidden nodes are skipped entirely (subtree included).
  if (node.hidden) return null

  const entry = getEntry(node.type)
  if (!entry) return null

  const { props, style: rawStyle } = resolveNode(entry, node, platform)

  /* State binding (Phase 4 slice 2): {state.x} in the text-content field
   * (text.content, button.title…) resolves against the node's screen's
   * effective values — edit mode shows initials, sim shows live values.
   * Undeclared names keep the raw {state.x} text (honest). */
  {
    const textKey = textPropField(entry, node.impl)?.key
    if (textKey !== undefined && typeof props[textKey] === 'string') {
      props[textKey] = statePreviewValue(props[textKey], stateValues)
    }
  }

  /* List binding (Phase 2): inside a repeated template, the text-content
   * field (text.content, button.title…) and the image source may hold a
   * safe {item.…}/{section.…} binding. Substitute per row — preview and
   * codegen share the resolver, so the canvas can never drift from code. */
  if (binding !== undefined) {
    const textKey = textPropField(entry, node.impl)?.key
    if (textKey !== undefined && typeof props[textKey] === 'string' && isItemBinding(props[textKey])) {
      props[textKey] = bindingPreviewValue(props[textKey], binding)
    }
    if (node.type === 'image' && typeof props.source === 'string' && isItemBinding(props.source)) {
      props.source = bindingPreviewValue(props.source, binding)
    }
  }
  /* Gradient fills render only on View-like containers (view/scrollview/\n   * blurview + unknown future containers); on Text/Button/etc they degrade to\n   * the first stop color — the exact rule the code generator applies, so the\n   * canvas and generated code can never drift. */
  const gradientCapable = node.type === 'view' || node.type === 'scrollview' || node.type === 'blurview' || (entry.children === 'any' && node.type !== 'button')
  const style = applyPaints(rawStyle, paletteResolver(palette), themeMode, gradientCapable)
  // Only container-policy entries ('any') can host children; leaf and
  // text-content components never render child nodes (RN rules). The binding
  // context (list row/section) flows down the whole subtree — the template's
  // nested Texts/Images resolve per row, exactly as the emitter threads it.
  const children = entry.children === 'any' ? renderChildNodes(node.id, childIndex, platform, binding) : null

  switch (node.type) {
    /* text ─ content prop as children; numberOfLines only when > 0 */
    case 'text': {
      const numberOfLines = asInt(props.numberOfLines) ?? 0
      return (
        <Text testID={node.id} style={style} numberOfLines={numberOfLines > 0 ? numberOfLines : undefined}>
          {/* RN Text children must be plain strings */}
          {textPropValue(entry, props, node.impl)}
        </Text>
      )
    }

    /* textinput ─ controlled value + keyboard affordances */
    case 'textinput': {
      const maxLength = asInt(props.maxLength)
      return (
        <TextInput
          testID={node.id}
          style={style}
          value={asString(props.value)}
          placeholder={asString(props.placeholder)}
          placeholderTextColor={asColor(props.placeholderTextColor)}
          keyboardType={asEnum(props.keyboardType, KEYBOARD_TYPES)}
          autoCapitalize={asEnum(props.autoCapitalize, AUTO_CAPITALIZE)}
          autoCorrect={asBool(props.autoCorrect)}
          multiline={asBool(props.multiline)}
          secureTextEntry={asBool(props.secureTextEntry)}
          editable={asBool(props.editable)}
          maxLength={maxLength !== undefined && maxLength > 0 ? maxLength : undefined}
          returnKeyType={asEnum(props.returnKeyType, RETURN_KEY_TYPES)}
        />
      )
    }

    /* button ─ implementation switching (Phase 2): the SAME composite look
     * (variant preset + typography split) renders through the active
     * implementation's real RNW component. The RN-Button variant renders the
     * platform look instead (its onPress no-op is a rendering requirement —
     * interactions are wired by the flow system, never faked here). */
    case 'button': {
      const implId = resolveImplementation(entry, node.impl)?.id ?? 'pressable'
      const variant = asEnum(props.variant, ['primary', 'secondary', 'ghost'] as const) ?? 'primary'
      const preset = BUTTON_VARIANT_BASE[variant]
      const { box, label } = splitTypographyStyle(style)
      const title = textPropValue(entry, props, node.impl) || 'Button'
      const disabled = asBool(props.disabled) ?? false

      if (implId === 'rnbutton') {
        const color = asColor(props.color)
        return (
          <Button
            testID={node.id}
            title={title}
            color={color}
            disabled={disabled}
            onPress={wiredPress ?? (() => {})}
          />
        )
      }
      if (implId === 'touchableopacity') {
        const activeOpacity = asFloat(props.activeOpacity)
        return (
          <TouchableOpacity
            testID={node.id}
            style={{ ...preset.box, ...box }}
            disabled={disabled}
            activeOpacity={activeOpacity}
            onPress={wiredPress}
          >
            <Text style={{ ...preset.label, ...label }}>{title}</Text>
          </TouchableOpacity>
        )
      }
      if (implId === 'touchablehighlight') {
        const activeOpacity = asFloat(props.activeOpacity)
        const underlayColor = asColor(props.underlayColor)
        return (
          <TouchableHighlight
            testID={node.id}
            style={{ ...preset.box, ...box }}
            disabled={disabled}
            activeOpacity={activeOpacity}
            underlayColor={underlayColor}
            onPress={wiredPress}
          >
            <Text style={{ ...preset.label, ...label }}>{title}</Text>
          </TouchableHighlight>
        )
      }
      return (
        <Pressable testID={node.id} style={{ ...preset.box, ...box }} disabled={disabled} onPress={wiredPress}>
          <Text style={{ ...preset.label, ...label }}>{title}</Text>
        </Pressable>
      )
    }

    /* scrollview ─ native DOM scrolling; device-only props are no-ops on web */
    case 'scrollview': {
      const showsIndicator = asBool(props.showsScrollIndicator) ?? true
      return (
        <ScrollView
          testID={node.id}
          style={style}
          horizontal={asBool(props.horizontal) ?? false}
          scrollEnabled={asBool(props.scrollEnabled) ?? true}
          showsVerticalScrollIndicator={showsIndicator}
          showsHorizontalScrollIndicator={showsIndicator}
        >
          {children}
        </ScrollView>
      )
    }

    /* view ─ implementation switching (Phase 2). safe-area → RNW's
     * SafeAreaView (a real component; web insets inside the artboard are zero,
     * so it renders as a plain container — the honest web equivalent). */
    case 'view': {
      if (resolveImplementation(entry, node.impl)?.id === 'safe-area') {
        return (
          <SafeAreaView testID={node.id} style={style}>
            {children}
          </SafeAreaView>
        )
      }
      return (
        <View testID={node.id} style={style}>
          {children}
        </View>
      )
    }

    /* flatlist (Phase 2) — the item template repeats once per data row. The
     * template children render through the REAL RNW FlatList (virtualized
     * scrolling on canvas); bindings substitute per row. Header / footer /
     * separator / empty children become the corresponding list chrome. */
    case 'flatlist': {
      const roles = partitionByRole(childIndex.get(node.id) ?? [])
      const items = listItems(props)
      const showsIndicator = asBool(props.showsScrollIndicator) ?? true
      const horizontal = asBool(props.horizontal) ?? false
      const numColumns = Math.max(1, Math.min(4, asInt(props.numColumns) ?? 1))
      const gap = Math.max(0, Math.min(64, asInt(props.itemSpacing) ?? 0))
      const rowEls = items.map((row, i) => (
        <Fragment key={i}>
          {roles.item.map((c) => (
            <PreviewNode key={c.id} node={c} childIndex={childIndex} platform={platform} binding={row} />
          ))}
        </Fragment>
      ))
      return (
        <FlatList
          testID={node.id}
          style={style}
          data={items}
          renderItem={({ index }) => rowEls[index] ?? null}
          horizontal={horizontal}
          numColumns={horizontal ? 1 : numColumns}
          showsVerticalScrollIndicator={showsIndicator}
          showsHorizontalScrollIndicator={showsIndicator}
          contentContainerStyle={gap > 0 ? { gap } : undefined}
          ListHeaderComponent={roles.header.length > 0 ? renderListChrome(roles.header, childIndex, platform) : undefined}
          ListFooterComponent={roles.footer.length > 0 ? renderListChrome(roles.footer, childIndex, platform) : undefined}
          ItemSeparatorComponent={roles.separator.length > 0 ? renderListChrome(roles.separator, childIndex, platform) : undefined}
          ListEmptyComponent={roles.empty.length > 0 ? renderListChrome(roles.empty, childIndex, platform) : undefined}
        />
      )
    }

    /* sectionlist (Phase 2) — rows grouped per section; the header design
     * (role 'header') renders once per section with {section.…} bindings.
     * RNW consumes the REAL SectionList with RN's section shape ({ header,
     * data }); the builder's array editor stores { header, items } — mapped
     * here and by the code emitter identically. */
    case 'sectionlist': {
      const roles = partitionByRole(childIndex.get(node.id) ?? [])
      const sections = listSections(props)
      const showsIndicator = asBool(props.showsScrollIndicator) ?? true
      const gap = Math.max(0, Math.min(64, asInt(props.itemSpacing) ?? 0))
      const rnSections: Array<{ header: string | undefined; data: ListItem[] }> = sections.map((s) => ({ header: s.header, data: s.items }))
      const sectionIndex = new Map<unknown, number>(rnSections.map((s, i) => [s, i] as const))
      const rowEls = rnSections.map((section) =>
        section.data.map((row, i) => (
          <Fragment key={i}>
            {roles.item.map((c) => (
              <PreviewNode key={c.id} node={c} childIndex={childIndex} platform={platform} binding={row} />
            ))}
          </Fragment>
        ))
      )
      const headerEls = rnSections.map((section) => (
        <Fragment key={sectionIndex.get(section)}>
          {roles.header.map((c) => (
            <PreviewNode key={c.id} node={c} childIndex={childIndex} platform={platform} binding={section} />
          ))}
        </Fragment>
      ))
      return (
        <SectionList
          testID={node.id}
          style={style}
          sections={rnSections}
          renderItem={({ section, index }) => rowEls[sectionIndex.get(section) ?? 0]?.[index] ?? null}
          renderSectionHeader={({ section }) => headerEls[sectionIndex.get(section) ?? 0] ?? null}
          showsVerticalScrollIndicator={showsIndicator}
          showsHorizontalScrollIndicator={showsIndicator}
          contentContainerStyle={gap > 0 ? { gap } : undefined}
          ListFooterComponent={roles.footer.length > 0 ? renderListChrome(roles.footer, childIndex, platform) : undefined}
          ItemSeparatorComponent={roles.separator.length > 0 ? renderListChrome(roles.separator, childIndex, platform) : undefined}
          ListEmptyComponent={roles.empty.length > 0 ? renderListChrome(roles.empty, childIndex, platform) : undefined}
        />
      )
    }

    /* image — implementation-aware (§ implementation switching).
     *  - expo-image (default): contentFit → RNW `resizeMode` PROP, tint →
     *    `tintColor` style — exactly the historical behavior.
     *  - react-native (core Image): `resizeMode` and `tintColor` are STYLE
     *    keys; `fadeDuration` is Android-only behavior with no web equivalent
     *    and is never rendered.
     * Props the active implementation's schema does not declare are never
     * applied. Empty source renders a light-gray placeholder box via a 1×1
     * transparent GIF source + backgroundColor (no DOM inside RNW trees). */
    case 'image': {
      const impl = resolveImplementation(entry, node.impl)
      const isCoreImage = impl?.id === 'react-native'
      const sourceUri = asString(props.source)?.trim() || null
      const imageStyle: Record<string, unknown> = { ...style }

      if (isCoreImage) {
        // Core Image: both knobs are style keys; node.style always wins.
        if (imageStyle.resizeMode === undefined) {
          imageStyle.resizeMode = asEnum(props.resizeMode, RESIZE_MODES) ?? 'cover'
        }
        const tintColor = asColor(props.tintColor)
        if (tintColor !== undefined && imageStyle.tintColor === undefined) {
          imageStyle.tintColor = tintColor
        }
      } else {
        // expo-image: tint → tintColor style (RNW turns it into a CSS filter).
        const tint = asColor(props.tint)
        if (tint !== undefined && imageStyle.tintColor === undefined) {
          imageStyle.tintColor = tint
        }
      }

      if (!sourceUri && imageStyle.backgroundColor === undefined) {
        imageStyle.backgroundColor = IMAGE_PLACEHOLDER_BG
      }

      // expo-image maps contentFit onto the resizeMode PROP (the mapping is a
      // no-op for the core variant, which carries the mode in its style).
      const resizeModeProp = isCoreImage
        ? undefined
        : CONTENT_FIT_TO_RESIZE_MODE[asString(props.contentFit) ?? 'cover'] ?? 'cover'

      return (
        <Image
          testID={node.id}
          style={imageStyle}
          source={{ uri: sourceUri ?? ONE_PIXEL_IMAGE }}
          resizeMode={resizeModeProp}
          aria-label={node.name || 'Image'}
        />
      )
    }

    /* switch ─ flat trackColorTrue/False compose RN's trackColor object.
     * ios_backgroundColor has no web equivalent — device-only. */
    case 'switch': {
      const trackColorTrue = asColor(props.trackColorTrue)
      const trackColorFalse = asColor(props.trackColorFalse)
      return (
        <Switch
          testID={node.id}
          style={style}
          value={asBool(props.value) ?? false}
          disabled={asBool(props.disabled) ?? false}
          thumbColor={asColor(props.thumbColor)}
          trackColor={
            trackColorTrue !== undefined || trackColorFalse !== undefined
              ? { true: trackColorTrue, false: trackColorFalse }
              : undefined
          }
        />
      )
    }

    /* activityindicator ─ color/size are props, not styles */
    case 'activityindicator': {
      return (
        <ActivityIndicator
          testID={node.id}
          style={style}
          animating={asBool(props.animating) ?? true}
          size={asEnum(props.size, ['small', 'large'] as const)}
          color={asColor(props.color)}
          hidesWhenStopped={asBool(props.hidesWhenStopped)}
        />
      )
    }

    /* divider ─ composite: props compile to a hairline View; style overrides */
    case 'divider': {
      const axis = asEnum(props.axis, ['horizontal', 'vertical'] as const) ?? 'horizontal'
      const thickness = asInt(props.thickness) ?? 1
      const length = props.length !== undefined ? props.length : '100%'
      const color = asColor(props.color) ?? '#E5E7EB'
      const base =
        axis === 'vertical'
          ? { width: thickness, height: length, backgroundColor: color }
          : { height: thickness, width: length, backgroundColor: color }
      return <View testID={node.id} style={{ ...base, ...style }} />
    }

    /* lineargradient ─ RNW ViewStyle supports backgroundImage, so the canvas
     * shows a REAL CSS gradient (RN 0.76+ supports the same syntax natively).
     * Codegen still emits expo-linear-gradient's LinearGradient. */
    case 'lineargradient': {
      const startColor = asColor(props.startColor) ?? '#A855F7'
      const endColor = asColor(props.endColor) ?? '#EC4899'
      const angle = clamp(asInt(props.angle) ?? 45, 0, 360)
      const gradient: Record<string, unknown> = {
        backgroundImage: `linear-gradient(${angle}deg, ${startColor}, ${endColor})`
      }
      return (
        <View testID={node.id} style={{ ...gradient, ...style }}>
          {children}
        </View>
      )
    }

    /* blurview ─ platform-variant approximation (docs/04 line 379):
     * iOS: CSS backdrop-filter blur + translucent tint (expo-blur's own web
     * approach); Android: plain semi-transparent View — the documented
     * fallback for devices below API 31. */
    case 'blurview': {
      const intensity = clamp(asInt(props.intensity) ?? 50, 0, 100)
      const tint = asEnum(props.tint, ['system', 'light', 'dark'] as const)
      if (platform === 'ios') {
        const blurPx = Math.round((intensity / 100) * 16)
        const alpha = 0.06 + (intensity / 100) * 0.3
        const overlay =
          tint === 'dark' ? `rgba(17, 24, 39, ${alpha})` : `rgba(255, 255, 255, ${alpha})`
        return (
          <View
            testID={node.id}
            style={{
              backdropFilter: `blur(${blurPx}px)`,
              backgroundColor: overlay,
              ...style
            }}
          >
            {children}
          </View>
        )
      }
      const alpha = 0.04 + (intensity / 100) * 0.12
      return (
        <View testID={node.id} style={{ backgroundColor: `rgba(255, 255, 255, ${alpha})`, ...style }}>
          {children}
        </View>
      )
    }

    /* view + any future/unknown container entry — generic View mapping */
    default: {
      return (
        <View testID={node.id} style={style}>
          {children}
        </View>
      )
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * ScreenTreePreview
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ScreenTreePreviewProps {
  /** The screen whose tree is rendered (background applied to the root View). */
  screen: Screen
  /** The project's flat node map (all screens; filtered by screenId here). */
  nodes: Record<string, ProjectNode>
  /** Device platform — selects per-variant behavior (e.g. blurview). */
  platform: PlatformId
  /** Sim runtime for wired interactions (Phase 4, P0-1). Absent (edit mode)
   *  → wired hooks render inert, exactly like unwired ones. */
  nav?: PreviewNav
}

export function ScreenTreePreview({ screen, nodes, platform, nav }: ScreenTreePreviewProps) {
  const childIndex = useMemo(() => buildChildIndex(nodes, screen.id), [nodes, screen.id])
  const roots = childIndex.get(null) ?? []
  /* Screen background is a paint value: solid hex, theme token, or gradient
   * (CSS backgroundImage on the root View; the artboard div behind shows the
   * same CSS as a fallback). */
  const palette = useProjectStore((s) => s.data.theme?.colors)
  const themeMode = useProjectStore((s) => s.ui.themeMode)
  const bgCss = paintSwatchBackground(screen.background, paletteResolver(palette), themeMode)
  const rootStyle: Record<string, unknown> = { flex: 1 }
  if (bgCss) {
    if (isGradientPaint(screen.background)) rootStyle.backgroundImage = bgCss
    else rootStyle.backgroundColor = bgCss
  }
  return (
    // Root View: fills the device-frame content area, carries the screen
    // background, and deliberately has NO testID (it is not a node).
    <PreviewNavContext.Provider value={nav ?? null}>
      <View style={rootStyle}>
        {roots.map((node) => (
          <PreviewNode key={node.id} node={node} childIndex={childIndex} platform={platform} />
        ))}
      </View>
    </PreviewNavContext.Provider>
  )
}
