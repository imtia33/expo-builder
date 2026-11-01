/*
 * ExpoForge codegen — public API (Task 6-B).
 *
 *   generateProjectFiles(data)  Map<path, file contents> — the generated Expo
 *                               app/ tree (expo-router@58 file mapping).
 *   codegenFileList(files)      FileTreeNode[] — tree for the right-panel Code tab.
 *   iconifyToPhosphorReact(name) 'ph:house' → 'House' tab icon mapping.
 *
 * Consumed by the Code tab and, later, project export. Pure and synchronous —
 * no side effects, no state; regeneration from the same ProjectData is
 * byte-identical.
 */

export { generateProjectFiles, codegenFileList } from './files'
export type { FileTreeNode } from './types'
export { iconifyToPhosphorReact } from './icons'
