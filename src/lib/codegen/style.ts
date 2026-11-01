/*
 * Inline style emission — docs/06 §2.2 as locked by Task 6-B:
 * placement keys first (position/left/top/…/width/height), then the rest of
 * the docs/06 order, unknown keys alphabetical at the end. Always inline
 * object literals — StyleSheet is FORBIDDEN (docs/06 §5.9).
 */

const PLACEMENT_KEYS: readonly string[] = [
  'position',
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height',
]

const REST_ORDER: readonly string[] = [
  'flex',
  'flexGrow',
  'flexShrink',
  'flexBasis',
  'flexDirection',
  'gap',
  'rowGap',
  'columnGap',
  'alignSelf',
  'justifyContent',
  'alignItems',
  'alignContent',
  'zIndex',
  'aspectRatio',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'margin',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'marginHorizontal',
  'marginVertical',
  'padding',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'paddingHorizontal',
  'paddingVertical',
  'borderWidth',
  'borderColor',
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
  'backgroundColor',
  'opacity',
  'overflow',
  'elevation',
  'shadowColor',
  'shadowOffset',
  'shadowOpacity',
  'shadowRadius',
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textDecorationLine',
  'textTransform',
  'transform',
  'transformOrigin',
]

const ALL_ORDER: readonly string[] = [...PLACEMENT_KEYS, ...REST_ORDER]

/** Text-carrying style keys — live on the inner <Text>, not the container (button emitter). */
export const TYPOGRAPHY_KEYS: ReadonlySet<string> = new Set([
  'color',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textAlign',
  'textDecorationLine',
  'textTransform',
])

/** Re-key a style object into canonical emission order; drops undefined keys. */
export function orderedStyle(style: Record<string, unknown>): Record<string, unknown> {
  const present = new Set(Object.keys(style).filter((k) => style[k] !== undefined))
  const out: Record<string, unknown> = {}
  for (const k of ALL_ORDER) {
    if (present.has(k)) {
      out[k] = style[k]
      present.delete(k)
    }
  }
  for (const k of [...present].sort()) out[k] = style[k]
  return out
}

/**
 * Split a style object into (container keys, typography keys), each in
 * canonical order. The button emitter puts typography on the inner <Text>
 * and everything else on the <Pressable> (text styling must live on Text in RN).
 */
export function splitTypography(style: Record<string, unknown>): {
  container: Record<string, unknown>
  typography: Record<string, unknown>
} {
  const container: Record<string, unknown> = {}
  const typography: Record<string, unknown> = {}
  for (const k of Object.keys(style)) {
    if (style[k] === undefined) continue
    if (TYPOGRAPHY_KEYS.has(k)) typography[k] = style[k]
    else container[k] = style[k]
  }
  return { container: orderedStyle(container), typography: orderedStyle(typography) }
}
