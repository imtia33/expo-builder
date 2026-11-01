/*
 * Test setup: zustand persist needs a localStorage stand-in under node.
 * In-memory implementation, reset between tests.
 */
import { beforeEach } from 'vitest'

class MemoryStorage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

const g = globalThis as unknown as { localStorage?: Storage }
if (!g.localStorage) {
  g.localStorage = new MemoryStorage() as Storage
}

beforeEach(() => {
  ;(g.localStorage as MemoryStorage).clear()
})
