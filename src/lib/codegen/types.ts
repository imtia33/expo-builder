/*
 * ExpoForge codegen — shared types.
 *
 * Public surface lives in ./index.ts:
 *   generateProjectFiles(data)  → Map<app/ path, file contents>
 *   codegenFileList(files)      → FileTreeNode[] tree for the Code tab
 */

/**
 * One node of the Code tab file tree.
 *
 * Ordering rule (consumed by the tree UI): directories first, then files,
 * both alphabetical by segment name. `app/` paths are the only inputs today,
 * but the builder is generic over any slash path map.
 */
export interface FileTreeNode {
  /** Segment name — 'app', '(main)', 'home.tsx'. */
  name: string
  /** Full slash-separated path from the virtual root. */
  path: string
  type: 'dir' | 'file'
  /** File nodes only: complete file contents (drives the Code tab viewer). */
  content?: string
  /** Dir nodes only (always present; empty for files). */
  children: FileTreeNode[]
}
