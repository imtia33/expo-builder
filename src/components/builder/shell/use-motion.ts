'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * The builder's dual motion gate (docs/03-design.md §7): framer animations run only when the
 * user has not asked the OS for reduced motion AND the document root does not carry
 * `data-motion='off'`. Mirrors the CSS `motion-safe` / `motion-reduce` custom variants ported
 * into `src/app/theme/tokens.css`, so one toggle kills animation globally in both systems.
 */
export function useMotionEnabled(): boolean {
  const prefersReducedMotion = useReducedMotion()
  const [attrMotionOff, setAttrMotionOff] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const update = () => setAttrMotionOff(root.getAttribute('data-motion') === 'off')
    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['data-motion'] })
    return () => observer.disconnect()
  }, [])

  return prefersReducedMotion !== true && !attrMotionOff
}
