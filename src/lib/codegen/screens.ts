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

import { identifierFromKebab } from './format'
import { ImportCollector } from './imports'
import { emitTreeNode } from './nodes'
import { orderedStyle } from './style'
import { el, elChild, renderElement, styleAttr } from './jsx'
import type { JsxElement } from './jsx'

export function renderScreenFile(data: ProjectData, screen: Screen): string {
  const imports = new ImportCollector()

  const tree = buildScreenTree(data, screen.id)
  const elements: JsxElement[] = []
  for (const tn of tree) {
    const e = emitTreeNode(tn, { imports })
    if (e) elements.push(e)
  }

  imports.addNamed('react-native', 'View')
  let root = el('View', [styleAttr(orderedStyle({ flex: 1, backgroundColor: screen.background }))], elements.map((e) => elChild(e)))

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
  const importLines = imports.render()
  lines.push(...importLines)
  lines.push('')
  lines.push(`export default function ${componentName}() {`)
  lines.push('  return (')
  lines.push(...renderElement(root, 4))
  lines.push('  );')
  lines.push('}')
  return `${lines.join('\n')}\n`
}
