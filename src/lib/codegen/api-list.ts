/*
 * API list emission (Phase 4, P0-3) — the generated-code half of REAL fetch
 * data sources (lib/lists/api-source is the model half).
 *
 * collectApiLists() walks a screen's tree BEFORE node emission and derives
 * the identifier set of every API-backed list (screen scope, unique against
 * user-declared state and each other). renderScreenFile then:
 *   1. seeds EmitContext.usage.api with the map (the list emitters read the
 *      identifiers for `data={x}` / `refreshing` / `onRefresh` attributes);
 *   2. appends apiDeclarationLines() — the useState/useCallback/useEffect
 *      block that fetches for real on device.
 *
 * Nesting rule (mirrored exactly by the live preview): lists nested INSIDE a
 * list's repeated templates (item template / section header) render as static
 * content — a fetch per rendered row would need hooks inside renderItem's
 * callback (illegal). Lists nested in once-per-list chrome (header/footer/
 * separator/empty/loading/error) keep API mode: their state hoists to the
 * screen, which is exactly how the emitted code reads.
 */

import type { ProjectNode, Screen } from '@/lib/project/types'
import type { TreeNode } from '@/lib/project/store'
import { isListEntryType, roleOfNode } from '@/lib/lists/bindings'
import {
  apiConfigFromProps,
  deriveApiIdentifiers,
  type ApiIdentifiers,
  type ApiSourceConfig
} from '@/lib/lists/api-source'
import { jsStringLiteral } from './format'

/** One API list's emission inputs (usage.api values). */
export interface ApiListEmission {
  node: ProjectNode
  config: ApiSourceConfig
  ids: ApiIdentifiers
}

/** True when `type` is flatlist/sectionlist and props select the API source. */
export function isApiListNode(node: ProjectNode): boolean {
  return isListEntryType(node.type) && apiConfigFromProps(node.props) !== null
}

/**
 * Collect the screen's API lists in tree order (deterministic identifier
 * derivation). Template subtrees (item / section header) are not descended
 * into — see the module header for the nesting rule.
 */
export function collectApiLists(tree: TreeNode[], screen: Screen | undefined): Map<string, ApiListEmission> {
  const nodes: ProjectNode[] = []
  const walk = (tns: TreeNode[]): void => {
    for (const tn of tns) {
      if (isListEntryType(tn.node.type)) {
        if (isApiListNode(tn.node)) nodes.push(tn.node)
        // Descend only into once-per-list chrome; the repeated templates
        // (item, and sectionlist's header) are render-callback contexts.
        const sectionHeaders = tn.node.type === 'sectionlist'
        walk(
          tn.children.filter((c) => {
            const role = roleOfNode(c.node)
            return role !== 'item' && !(sectionHeaders && role === 'header')
          })
        )
        continue
      }
      walk(tn.children)
    }
  }
  walk(tree)
  const identifiers = deriveApiIdentifiers(nodes, screen)
  const out = new Map<string, ApiListEmission>()
  for (const node of nodes) {
    const config = apiConfigFromProps(node.props)
    const ids = identifiers.get(node.id)
    if (config && ids) out.set(node.id, { node, config, ids })
  }
  return out
}

/* ────────────────────────────────────────────────────────────────────────────
 * The loader + declarations (exact generated shapes; pinned by tests)
 * ──────────────────────────────────────────────────────────────────────────── */

/** `json?.a?.b` / `json` — the optional-chained walk of a collection path. */
function optionalWalk(segments: string[]): string {
  return ['json', ...segments.map((s) => `?.${s}`)].join('')
}

/** `json.a.b` — the plain walk (used after an Array.isArray guard). */
function plainWalk(segments: string[]): string {
  return ['json', ...segments.map((s) => `.${s}`)].join('')
}

/** The rows-walk expression, e.g.
 *  `Array.isArray(json?.data?.results) ? json.data.results : []`
 *  (empty path: `Array.isArray(json) ? json : []`). */
function arrayAtExpression(collectionPath: string): string {
  const segs = collectionPath === '' ? [] : collectionPath.split('.')
  if (segs.length === 0) return 'Array.isArray(json) ? json : []'
  return `Array.isArray(${optionalWalk(segs)}) ? ${plainWalk(segs)} : []`
}

const q = jsStringLiteral

/**
 * The useState/useCallback/useEffect block for one API list, at component
 * indent (2). The loader fetches for real: no mock, no sample rows. Loading
 * starts true and is only cleared in `finally` — a refresh keeps stale rows
 * on screen (RN's refreshing spinner owns that feedback), while the initial
 * mount shows the user-designed loading state through ListEmptyComponent.
 */
export function apiDeclarationLines(emission: ApiListEmission): string[] {
  const { config, ids, node } = emission
  const setter = (name: string): string => `set${name.charAt(0).toUpperCase()}${name.slice(1)}`
  const lines: string[] = []

  // useState declarations (rows start empty; loading starts true).
  lines.push(`  const [${ids.data}, ${setter(ids.data)}] = useState([]);`)
  lines.push(`  const [${ids.loading}, ${setter(ids.loading)}] = useState(true);`)
  lines.push(`  const [${ids.error}, ${setter(ids.error)}] = useState(null);`)
  if (ids.refreshing) lines.push(`  const [${ids.refreshing}, ${setter(ids.refreshing)}] = useState(false);`)
  lines.push('')

  // The loader — a real fetch against the configured endpoint.
  lines.push(`  const ${ids.loader} = useCallback(async () => {`)
  lines.push(`    ${setter(ids.error)}(null);`)
  lines.push('    try {')
  const optionLines: string[] = [`method: ${q(config.method)},`]
  const headerKeys = Object.keys(config.headers)
  if (headerKeys.length > 0) {
    optionLines.push('headers: {')
    for (const key of headerKeys) optionLines.push(`  ${key}: ${q(config.headers[key])},`)
    optionLines.push('},')
  }
  if (config.method === 'POST' && config.body !== '') optionLines.push(`body: ${q(config.body)},`)
  if (optionLines.length === 1) {
    lines.push(`    const response = await fetch(${q(config.url)}, { ${optionLines[0]} });`)
  } else {
    lines.push(`    const response = await fetch(${q(config.url)}, {`)
    for (const line of optionLines) lines.push(`      ${line}`)
    lines.push('    });')
  }
  lines.push('    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);')
  lines.push('    const json = await response.json();')
  if (node.type === 'sectionlist') {
    const sectionsVar = `${ids.data}Sections`
    lines.push(`    const ${sectionsVar} = ${arrayAtExpression(config.collectionPath)};`)
    lines.push(`    ${setter(ids.data)}(`)
    lines.push(`      ${sectionsVar}.map((section) => ({`)
    lines.push('        header:')
    lines.push('          typeof section?.header === \'string\'')
    lines.push('            ? section.header')
    lines.push("            : typeof section?.title === 'string'")
    lines.push('              ? section.title')
    lines.push("              : '',")
    lines.push('        data: Array.isArray(section?.data)')
    lines.push('          ? section.data')
    lines.push('          : Array.isArray(section?.items)')
    lines.push('            ? section.items')
    lines.push('            : [],')
    lines.push('      }))')
    lines.push('    );')
  } else {
    lines.push(`    ${setter(ids.data)}(${arrayAtExpression(config.collectionPath)});`)
  }
  lines.push('    } catch (e) {')
  lines.push(`      ${setter(ids.error)}(e instanceof Error ? e.message : 'Something went wrong');`)
  lines.push('    } finally {')
  lines.push(`      ${setter(ids.loading)}(false);`)
  if (ids.refreshing) lines.push(`      ${setter(ids.refreshing)}(false);`)
  lines.push('    }')
  lines.push('  }, []);')
  lines.push('')
  lines.push('  useEffect(() => {')
  lines.push(`    ${ids.loader}();`)
  lines.push(`  }, [${ids.loader}]);`)
  return lines
}
