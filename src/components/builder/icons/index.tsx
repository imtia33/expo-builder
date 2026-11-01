'use client'
/*
 * Icon system — Iconify with the Phosphor collection loaded OFFLINE
 * (no runtime API calls). One coherent icon set across the whole editor:
 * toolbar, tree, chips, dialogs, inspector.
 *
 * Usage: <Icon icon="ph:house" size={14} /> — invalid names render nothing
 * and log a console warning (easy to catch in dev).
 */
import { addCollection, Icon as IconifyIcon } from '@iconify/react'
import phCollection from '@iconify-json/ph/icons.json'

// Loaded once at module scope (client and SSR); idempotent.
addCollection(phCollection)

export { IconifyIcon }
export const ICON_COLLECTION_PREFIX = 'ph'
