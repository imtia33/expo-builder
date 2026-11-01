/*
 * Ambient types for react-syntax-highlighter v15 (ships no .d.ts of its own;
 * @types/react-syntax-highlighter is not installed). Declares ONLY the surface
 * the Code tab uses: the Prism component and the single registered theme.
 */
declare module 'react-syntax-highlighter' {
  import type { ComponentType, CSSProperties, ReactNode } from 'react'

  export interface SyntaxHighlighterProps {
    language?: string
    style?: Record<string, CSSProperties>
    customStyle?: CSSProperties
    codeTagProps?: Record<string, unknown>
    showLineNumbers?: boolean
    wrapLongLines?: boolean
    children?: ReactNode
  }

  export const Prism: ComponentType<SyntaxHighlighterProps>
}

declare module 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus' {
  const vscDarkPlus: Record<string, import('react').CSSProperties>
  export default vscDarkPlus
}
