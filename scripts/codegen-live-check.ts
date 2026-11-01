/* Throwaway verification: run the real codegen against the live persisted project. */
import { readFileSync } from 'fs'
import { generateProjectFiles } from '../src/lib/codegen'

const data = JSON.parse(readFileSync('/tmp/live-data.json', 'utf8'))
const files = generateProjectFiles(data)
console.log('== FILES ==')
for (const [path, content] of [...files].sort()) {
  console.log(path, `(${content.split('\n').length} lines)`)
}
console.log('\n== app/_layout.tsx ==')
console.log(files.get('app/_layout.tsx'))
console.log('\n== app/(auth)/_layout.tsx ==')
console.log(files.get('app/(auth)/_layout.tsx'))
console.log('\n== app/(auth)/sign-in.tsx ==')
console.log(files.get('app/(auth)/sign-in.tsx'))
