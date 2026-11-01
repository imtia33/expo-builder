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
import { useMemo, type ReactNode } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  type StyleRecord
} from 'react-native-web'

import type { PlatformId } from '@/components/builder/screens/device-presets'
import type { ProjectNode, Screen } from '@/lib/project/types'
import { getEntry, resolveImplementation } from '../registry'
import { resolveNode, textPropValue } from './resolve'

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
 * Node renderer — per-type RNW mapping
 * ──────────────────────────────────────────────────────────────────────────── */

import { useProjectStore } from '@/lib/project/store'
import { applyPaints, isGradientPaint, paletteResolver, paintSwatchBackground } from '@/lib/paint'

interface PreviewNodeProps {
  node: ProjectNode
  childIndex: ChildIndex
  platform: PlatformId
}

function renderChildNodes(parentId: string, childIndex: ChildIndex, platform: PlatformId): ReactNode[] {
  return (childIndex.get(parentId) ?? []).map((child) => (
    <PreviewNode key={child.id} node={child} childIndex={childIndex} platform={platform} />
  ))
}

function PreviewNode({ node, childIndex, platform }: PreviewNodeProps): ReactNode {
  /* Paint resolution (Phase 1): theme tokens bind to the project palette,
   * gradients (backgroundColor) become RNW CSS backgroundImage. Subscribing
   * here means palette edits + light/dark toggles re-render the tree. Hooks
   * run BEFORE the early returns below (rules of hooks — hidden/unknown
   * nodes must not change the hook count). */
  const palette = useProjectStore((s) => s.data.theme?.colors)
  const themeMode = useProjectStore((s) => s.ui.themeMode)

  // Hidden nodes are skipped entirely (subtree included).
  if (node.hidden) return null

  const entry = getEntry(node.type)
  if (!entry) return null

  const { props, style: rawStyle } = resolveNode(entry, node, platform)
  /* Gradient fills render only on View-like containers (view/scrollview/\n   * blurview + unknown future containers); on Text/Button/etc they degrade to\n   * the first stop color — the exact rule the code generator applies, so the\n   * canvas and generated code can never drift. */
  const gradientCapable = node.type === 'view' || node.type === 'scrollview' || node.type === 'blurview' || (entry.children === 'any' && node.type !== 'button')
  const style = applyPaints(rawStyle, paletteResolver(palette), themeMode, gradientCapable)
  // Only container-policy entries ('any') can host children; leaf and
  // text-content components never render child nodes (RN rules).
  const children = entry.children === 'any' ? renderChildNodes(node.id, childIndex, platform) : null

  switch (node.type) {
    /* text ─ content prop as children; numberOfLines only when > 0 */
    case 'text': {
      const numberOfLines = asInt(props.numberOfLines) ?? 0
      return (
        <Text testID={node.id} style={style} numberOfLines={numberOfLines > 0 ? numberOfLines : undefined}>
          {/* RN Text children must be plain strings */}
          {textPropValue(entry, props)}
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

    /* button ─ Pressable composite with centered label Text */
    case 'button': {
      const variant = asEnum(props.variant, ['primary', 'secondary', 'ghost'] as const) ?? 'primary'
      const preset = BUTTON_VARIANT_BASE[variant]
      const { box, label } = splitTypographyStyle(style)
      return (
        <Pressable testID={node.id} style={{ ...preset.box, ...box }} disabled={asBool(props.disabled) ?? false}>
          <Text style={{ ...preset.label, ...label }}>{textPropValue(entry, props)}</Text>
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
}

export function ScreenTreePreview({ screen, nodes, platform }: ScreenTreePreviewProps) {
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
    <View style={rootStyle}>
      {roots.map((node) => (
        <PreviewNode key={node.id} node={node} childIndex={childIndex} platform={platform} />
      ))}
    </View>
  )
}
