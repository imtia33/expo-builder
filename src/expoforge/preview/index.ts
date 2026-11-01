/*
 * Live preview module — the react-native-web renderer for screen node trees
 * plus the DOM chrome for tabs/stack navigation. Consumers:
 *
 *   import { ScreenTreePreview, TabBarPreview, StackHeaderPreview, NODE_DOM_ATTR } from '@/expoforge/preview'
 *
 * Canvas hit-testing contract: every node in a ScreenTreePreview renders with
 * testID={node.id} → `data-testid` on the DOM (NODE_DOM_ATTR). Resolve clicks
 * with event.target.closest(`[${NODE_DOM_ATTR}]`).
 */
export { NODE_DOM_ATTR } from './constants'
export { resolveNode, textPropField, textPropValue } from './resolve'
export type { ResolvedNode } from './resolve'
export { ScreenTreePreview } from './renderer'
export type { ScreenTreePreviewProps } from './renderer'
export { BUTTON_VARIANT_BASE } from './renderer'
export type { ButtonVariantPreset } from './renderer'
export { TabBarPreview } from './tab-bar'
export type { TabBarPreviewProps } from './tab-bar'
export { StackHeaderPreview } from './stack-header'
export type { StackHeaderPreviewProps } from './stack-header'
