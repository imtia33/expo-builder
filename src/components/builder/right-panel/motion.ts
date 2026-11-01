'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

/**
 * Dual-gate motion switch (doc §7): framer animations run only when the user has no
 * reduced-motion preference AND the app hasn't set [data-motion='off'] on <html>.
 * CSS transitions use the ported `motion-reduce:` custom variant (tokens.css), which
 * applies the same dual gate.
 */
export function useMotionEnabled(): boolean {
  const prefersReducedMotion = useReducedMotion()
  const [motionOff, setMotionOff] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const read = () => setMotionOff(root.getAttribute('data-motion') === 'off')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-motion'] })
    return () => observer.disconnect()
  }, [])

  return !prefersReducedMotion && !motionOff
}
