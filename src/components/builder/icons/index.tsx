'use client'
/*
 * Icon system — Iconify with collections loaded OFFLINE (no runtime API).
 * One coherent icon pipeline across the whole editor: toolbar, tree, chips,
 * dialogs, inspector.
 *
 * Collections:
 *   ph — Phosphor: the editor-wide default set (full collection, small).
 *   The 8 required element-identifier collections (codicon, ant-design,
 *   tabler, akar-icons, andrsrxn, reicon, f7, iconmind) are VENDORED per-icon
 *   from @iconify-json/* by scripts/vendor-icons.mjs — full collections are
 *   tens of MB of JSON (breaks tsc's heap and bloats the bundle), so only the
 *   required glyph bodies ship. Identifiers are preserved verbatim.
 *
 * Usage: <Icon icon="ph:house" size={14} /> — invalid names render nothing
 * and log a console warning (easy to catch in dev).
 *
 * NOTE on andrsrxn: the required identifier "andrsrx:text-case-sensitive" lives
 * in the Iconify collection whose real prefix is `andrsrxn` (Andrés Raxón's
 * icons, MIT). `andrsrx` is not a collection prefix — this is the same glyph.
 */
import { addCollection, Icon as IconifyIcon } from '@iconify/react'
import phCollection from '@iconify-json/ph/icons.json'

import { VENDORED_COLLECTIONS } from './vendor'

// Loaded once at module scope (client and SSR); idempotent.
addCollection(phCollection)
for (const collection of VENDORED_COLLECTIONS) addCollection(collection)

export { IconifyIcon }
export const ICON_COLLECTION_PREFIX = 'ph'
