'use client'

/*
 * API source status (Phase 4, P0-3) — the live request status for a list
 * whose data source is an API endpoint. Rendered by the Props tab directly
 * below the "Data source" section that configures the endpoint.
 *
 * ONE cache, every consumer: useApiSource here is the same subscription the
 * artboard renders rows through — "Fetching…" on this row IS the request
 * painting the canvas, and Reload re-runs the real fetch (the browser's own
 * network stack; no canned states anywhere). Reload is the web-canvas stand-in
 * for pull-to-refresh (the registry field says so; the generated app keeps the
 * real pull gesture through FlatList onRefresh).
 */

import { RotateCw } from 'lucide-react'

import { panelFieldBase } from '@/app/theme/panel/field/base'
import {
  apiConfigFromProps,
  apiStatusLine,
  reloadApiSource,
  useApiSource,
  type ApiFetchState
} from '@/lib/lists/api-source'
import type { ProjectNode } from '@/lib/project/types'
import { cn } from '@/lib/utils'

import { CollapsibleSection } from '../collapsible-section'

const STATUS_DOT: Record<ApiFetchState['status'], string> = {
  idle: 'bg-border',
  loading: 'bg-primary motion-safe:animate-pulse',
  success: 'bg-success',
  error: 'bg-error'
}

export function ApiStatusSection({ node }: { node: ProjectNode }) {
  /* Hooks first (rules of hooks); the config decides everything after. */
  const config = apiConfigFromProps(node.props)
  const state = useApiSource(config)

  /* Not an API list, or the endpoint is not configured yet → nothing. The
   * registry's Data-source fields carry their own guidance; no dead UI. */
  if (config === null) return null

  const loading = state.status === 'loading'

  return (
    <CollapsibleSection id="props-api-status" title="Request">
      <div className="flex min-w-0 flex-col gap-2">
        <div className={cn(panelFieldBase, 'flex items-center gap-2 px-2 py-1.5')}>
          <span
            className={cn('size-2 shrink-0 rounded-full', STATUS_DOT[state.status])}
            aria-hidden="true"
            data-status={state.status}
          />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[11px]',
              state.status === 'error' ? 'text-error' : 'text-surface'
            )}
          >
            {apiStatusLine(state)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => void reloadApiSource(config)}
          disabled={loading}
          className={cn(
            'flex h-7 w-full items-center justify-center gap-1.5 rounded-md border text-[11px]',
            'border-border text-muted hover:border-primary/60 hover:text-surface',
            'disabled:pointer-events-none disabled:opacity-50',
            loading && 'motion-safe:animate-pulse'
          )}
        >
          <RotateCw className={cn('size-3', loading && 'motion-safe:animate-spin')} aria-hidden="true" />
          Reload
        </button>
        <p className="text-[10px] leading-relaxed text-muted">
          The canvas fetches from your browser, so the endpoint must allow cross-origin requests. The
          generated app performs the same request on device.
        </p>
      </div>
    </CollapsibleSection>
  )
}
