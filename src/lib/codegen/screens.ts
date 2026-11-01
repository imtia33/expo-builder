/*
 * Screen file emission — one file per screen (docs/06 §3.2 + Task 6-B locks).
 *
 * Structure:
 *   <imports>
 *
 *   export default function <Pascal(route)>Screen() {
 *     return (
 *       <SafeAreaView edges={[…enabled edges]} style={{ flex: 1 }}>   ← only when an edge is enabled
 *         <View style={{ flex: 1, backgroundColor: <screen.background> }}>
 *           …node tree…
 *         </View>
 *       </SafeAreaView>
 *     );
 *   }
 *
 * - SafeAreaView ALWAYS from 'react-native-safe-area-context' (never RN core);
 *   skipped entirely (no wrapper, no import) when no edges are enabled.
 * - No react import in v1 (no hooks needed — behavior/Flows is a later module).
 * - NEVER StyleSheet — all styles are inline literals.
 */

import { buildScreenTree } from '@/lib/project/store'
import type { ProjectData, Screen } from '@/lib/project/types'
import { isGradientPaint, isTokenPaint } from '@/lib/paint'

import { identifierFromKebab } from './format'
import { ImportCollector } from './imports'
import { emitTreeNode, newEmitContext } from './nodes'
import { gradientAttrs, tokenCode } from './paint'
import { orderedStyle } from './style'
import { el, elChild, renderElement, styleAttr } from './jsx'
import type { JsxAttr, JsxElement } from './jsx'

export function renderScreenFile(data: ProjectData, screen: Screen): string {
  const imports = new ImportCollector()
  const ctx = newEmitContext(imports)

  const tree = buildScreenTree(data, screen.id)
  const elements: JsxElement[] = []
  for (const tn of tree) {
    const e = emitTreeNode(tn, ctx)
    if (e) elements.push(e)
  }

  imports.addNamed('react-native', 'View')

  /* Screen background paint (Phase 1): token → `colors.x` (useTheme),
   * gradient → the root becomes an expo-linear-gradient wrapper, solid →
   * the historical root View backgroundColor. */
  const rootChildren = elements.map((e) => elChild(e))
  let root: JsxElement
  if (isGradientPaint(screen.background)) {
    imports.addNamed('expo-linear-gradient', 'LinearGradient')
    const g = gradientAttrs(screen.background)
    const rootAttrs: JsxAttr[] = [
      { name: 'colors', value: { kind: 'raw', value: g.colors } },
      ...(g.locations ? [{ name: 'locations', value: { kind: 'raw' as const, value: g.locations } }] : []),
      { name: 'start', value: { kind: 'raw', value: g.start } },
      { name: 'end', value: { kind: 'raw', value: g.end } },
      styleAttr({ flex: 1 })
    ]
    root = el('LinearGradient', rootAttrs, rootChildren)
  } else {
    const bg = isTokenPaint(screen.background) ? tokenCode(screen.background.token) : screen.background
    if (isTokenPaint(screen.background)) ctx.paint.tokens.add(screen.background.token)
    root = el('View', [styleAttr(orderedStyle({ flex: 1, backgroundColor: bg }))], rootChildren)
  }

  const edges: string[] = []
  if (screen.safeArea.top) edges.push('top')
  if (screen.safeArea.bottom) edges.push('bottom')
  if (edges.length > 0) {
    imports.addNamed('react-native-safe-area-context', 'SafeAreaView')
    root = el(
      'SafeAreaView',
      [{ name: 'edges', value: { kind: 'raw', value: edges } }, styleAttr({ flex: 1 })],
      [elChild(root)]
    )
  }

  const componentName = `${identifierFromKebab(screen.route)}Screen`
  const lines: string[] = []
  /* Tokens used anywhere in the tree (or the screen background) → the file
   * needs the theme hook: `const { colors } = useTheme()` + import. The hook
   * follows the plain-TS theme pattern (constants/theme.ts, no NativeWind). */
  const usesTokens = ctx.paint.tokens.size > 0
  if (usesTokens) imports.addNamed('@/hooks/useTheme', 'useTheme')
  const importLines = imports.render()
  lines.push(...importLines)
  lines.push('')
  lines.push(`export default function ${componentName}() {`)
  if (usesTokens) lines.push('  const { colors } = useTheme();')
  lines.push('  return (')
  lines.push(...renderElement(root, 4))
  lines.push('  );')
  lines.push('}')
  return `${lines.join('\n')}\n`
}
