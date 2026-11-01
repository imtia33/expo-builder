/*
 * Preview-module constants shared with the canvas hit-testing layer.
 */

/**
 * The DOM attribute react-native-web renders `testID` as. Every node in a
 * ScreenTreePreview carries `testID={node.id}`, so the canvas can map a DOM
 * element back to its ProjectNode by walking up to the nearest ancestor with
 * this attribute (element.closest(`[${NODE_DOM_ATTR}]`)).
 */
export const NODE_DOM_ATTR = 'data-testid'
