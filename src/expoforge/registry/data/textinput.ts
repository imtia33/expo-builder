/*
 * textinput · docs/04 §3.5 (line 618) — RN core TextInput, always emitted as a
 * controlled input (codegen wraps `value` in a useState / store binding).
 *
 * v3 rework: every prop below is verified against the RN TextInput public API.
 * Device-only affordances (clearButtonMode, textContentType, contextMenuHidden,
 * caretHidden, enablesReturnKeyAutomatically) are exposed with platform gates +
 * canvas-fidelity notes instead of being dropped. `textAlignVertical` (Android)
 * remains omitted — it is a STYLE key in RN (not a prop); users reach it through
 * the typography section.
 *
 * Sections: Content (value/placeholder/multiline/maxLength) · Behavior (keyboard,
 * autocompletion, security, focus affordances).
 */
import type { RegistryEntry } from '../types'

export const TEXTINPUT_ENTRY: RegistryEntry = {
  id: 'textinput',
  name: 'Text Input',
  icon: 'ph:cursor-text',
  category: 'input',
  description: 'A single- or multi-line text field. keyboardType switches the on-device keyboard.',
  children: 'none',
  insert: { width: 260, height: 48 },
  props: [
    { key: 'value', label: 'Value', type: 'string', placeholder: 'Initial value…', section: 'Content' },
    { key: 'placeholder', label: 'Placeholder', type: 'string', default: 'Enter text', section: 'Content' },
    { key: 'placeholderTextColor', label: 'Placeholder color', type: 'color', default: '#9CA3AF', section: 'Content' },
    { key: 'multiline', label: 'Multiline', type: 'boolean', default: false, section: 'Content' },
    {
      key: 'maxLength',
      label: 'Max length',
      type: 'number',
      min: 0,
      step: 1,
      section: 'Content',
      description: 'Caps the number of characters (0 or unset = unlimited).'
    },
    {
      key: 'inputMode',
      label: 'Input mode',
      type: 'enum',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'text', label: 'Text' },
        { value: 'decimal', label: 'Decimal' },
        { value: 'numeric', label: 'Numeric' },
        { value: 'tel', label: 'Telephone' },
        { value: 'email', label: 'Email' },
        { value: 'url', label: 'URL' },
        { value: 'search', label: 'Search' }
      ],
      default: 'default',
      section: 'Behavior',
      description:
        'Modern replacement for keyboardType (RN 0.72+) — determines which keyboard opens. Applies on device; the canvas preview still follows keyboardType.'
    },
    {
      key: 'keyboardType',
      label: 'Keyboard type',
      type: 'enum',
      options: [
        { value: 'default', label: 'Default' },
        { value: 'number-pad', label: 'Number pad' },
        { value: 'decimal-pad', label: 'Decimal pad' },
        { value: 'email-address', label: 'Email' },
        { value: 'phone-pad', label: 'Phone pad' },
        { value: 'ascii-capable', label: 'ASCII capable' },
        { value: 'numbers-and-punctuation', label: 'Numbers & punctuation' },
        { value: 'url', label: 'URL' }
      ],
      default: 'default',
      section: 'Behavior',
      description: 'Switches the on-device keyboard (legacy — prefer inputMode).'
    },
    {
      key: 'autoCapitalize',
      label: 'Auto capitalize',
      type: 'enum',
      options: [
        { value: 'none', label: 'None' },
        { value: 'sentences', label: 'Sentences' },
        { value: 'words', label: 'Words' },
        { value: 'characters', label: 'Characters' }
      ],
      default: 'sentences',
      section: 'Behavior'
    },
    { key: 'autoCorrect', label: 'Auto correct', type: 'boolean', default: true, section: 'Behavior' },
    { key: 'secureTextEntry', label: 'Secure (password)', type: 'boolean', default: false, section: 'Behavior' },
    {
      key: 'returnKeyType',
      label: 'Return key',
      type: 'enum',
      options: [
        { value: 'done', label: 'Done' },
        { value: 'go', label: 'Go' },
        { value: 'next', label: 'Next' },
        { value: 'search', label: 'Search' },
        { value: 'send', label: 'Send' }
      ],
      section: 'Behavior',
      description: 'Labels the return key on the on-device keyboard (curated subset of the platform values).'
    },
    {
      key: 'enablesReturnKeyAutomatically',
      label: 'Smart return key',
      type: 'boolean',
      default: false,
      section: 'Behavior',
      description: 'Disables the return key while the field is empty. Applies on device; not shown in the canvas preview.'
    },
    { key: 'editable', label: 'Editable', type: 'boolean', default: true, section: 'Behavior' },
    {
      key: 'clearButtonMode',
      label: 'Clear button (iOS)',
      type: 'enum',
      options: [
        { value: 'never', label: 'Never' },
        { value: 'while-editing', label: 'While editing' },
        { value: 'unless-editing', label: 'Unless editing' },
        { value: 'always', label: 'Always' }
      ],
      default: 'never',
      platform: ['ios'],
      section: 'Behavior',
      description: 'Shows the native × clear button inside the field. Applies on device; not shown in the canvas preview.'
    },
    {
      key: 'textContentType',
      label: 'Content type (iOS autofill)',
      type: 'enum',
      options: [
        { value: 'none', label: 'None' },
        { value: 'name', label: 'Name' },
        { value: 'username', label: 'Username' },
        { value: 'emailAddress', label: 'Email address' },
        { value: 'telephoneNumber', label: 'Phone number' },
        { value: 'URL', label: 'URL' },
        { value: 'password', label: 'Password' },
        { value: 'newPassword', label: 'New password' },
        { value: 'oneTimeCode', label: 'One-time code' },
        { value: 'postalCode', label: 'Postal code' }
      ],
      default: 'none',
      platform: ['ios'],
      section: 'Behavior',
      description: 'Hints iOS autofill / QuickType (contacts, passwords, SMS codes). Applies on device; not shown in the canvas preview.'
    },
    {
      key: 'selectTextOnFocus',
      label: 'Select all on focus',
      type: 'boolean',
      default: false,
      section: 'Behavior',
      description: 'Selects the entire text as soon as the field gains focus.'
    },
    {
      key: 'caretHidden',
      label: 'Hide caret',
      type: 'boolean',
      default: false,
      section: 'Behavior',
      description: 'Hides the text insertion caret. Applies on device; not shown in the canvas preview.'
    },
    {
      key: 'contextMenuHidden',
      label: 'Hide context menu',
      type: 'boolean',
      default: false,
      platform: ['android'],
      section: 'Behavior',
      description: 'Suppresses the long-press text menu (copy, paste, share). Applies on device; not shown in the canvas preview.'
    }
  ],
  styleSections: ['typography', 'layout', 'spacing', 'appearance', 'effects'],
  codegen: { import: "import { TextInput } from 'react-native'", component: 'TextInput' },
  previewNote:
    'Rendered live by react-native-web; keyboardType maps to HTML input types. clearButtonMode / textContentType / caretHidden / contextMenuHidden are device-only.'
}
