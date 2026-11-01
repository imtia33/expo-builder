/*
 * Import collection + rendering.
 *
 * Emitters register every symbol they actually emit; lines are rendered from
 * the collected set — one line per module, symbols sorted alphabetically. The
 * result never carries unused imports (docs/06 gate G1) and never duplicates a
 * module line (two react-native entries merge into `import { Text, View } …`).
 *
 * Module ordering is alphabetical by package path — deterministic and stable
 * across regenerations.
 */

export class ImportCollector {
  private modules = new Map<string, { named: Set<string>; defaults: Set<string>; namespaces: Set<string> }>()

  private bucket(module: string): { named: Set<string>; defaults: Set<string>; namespaces: Set<string> } {
    let b = this.modules.get(module)
    if (!b) {
      b = { named: new Set(), defaults: new Set(), namespaces: new Set() }
      this.modules.set(module, b)
    }
    return b
  }

  addNamed(module: string, symbol: string): void {
    this.bucket(module).named.add(symbol)
  }

  addDefault(module: string, symbol: string): void {
    this.bucket(module).defaults.add(symbol)
  }

  /**
   * `import * as X from 'mod';` — for NON-component namespaces only (behavior
   * modules, e.g. `import * as Haptics from 'expo-haptics'`, a future Flows
   * concern). A module namespace object is never a valid JSX element type, so
   * component entries are always registered via addNamed/addDefault.
   */
  addNamespace(module: string, symbol: string): void {
    this.bucket(module).namespaces.add(symbol)
  }

  render(): string[] {
    const lines: string[] = []
    for (const mod of [...this.modules.keys()].sort()) {
      const b = this.modules.get(mod)
      if (!b) continue
      for (const ns of [...b.namespaces].sort()) lines.push(`import * as ${ns} from '${mod}';`)
      const names = [...b.named].sort()
      const defs = [...b.defaults].sort()
      if (defs.length === 0) {
        if (names.length > 0) lines.push(`import { ${names.join(', ')} } from '${mod}';`)
      } else if (names.length === 0) {
        lines.push(`import ${defs[0]} from '${mod}';`)
      } else {
        lines.push(`import ${defs[0]}, { ${names.join(', ')} } from '${mod}';`)
      }
    }
    return lines
  }
}
