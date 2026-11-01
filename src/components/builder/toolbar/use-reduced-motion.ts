'use client'
/*
 * Reduced-motion gate, doc §7: every animation in this folder runs with
 * duration 0 when `prefers-reduced-motion` is set OR the root carries
 * `data-motion='off'` (the dual gate ported from open-pencil's motion variants
 * in theme/tokens.css).
 */

import { useEffect, useState } from 'react'

import { useReducedMotion as useFramerReducedMotion } from 'framer-motion'

export function useReducedMotionPref(): boolean {
  const framer = useFramerReducedMotion() ?? false
  const [attrOff, setAttrOff] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    const read = () => setAttrOff(root.getAttribute('data-motion') === 'off')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributes: true, attributeFilter: ['data-motion'] })
    return () => observer.disconnect()
  }, [])

  return framer || attrOff
}
