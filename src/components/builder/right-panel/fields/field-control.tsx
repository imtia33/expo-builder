'use client'

/*
 * FieldControl — dispatches one FieldSpec to its control. All controls accept the
 * row label id for aria wiring and merge a caller-supplied className last.
 */

import type { FieldChangeValue, FieldSpec } from '../schema'
import { ArrayField } from './array-field'
import { ColorField } from './color-field'
import { NumberField } from './number-field'
import { SegmentedField, SelectField, SwitchField, TextAreaField, TextField } from './simple-fields'
import { SliderField } from './slider-field'

export interface FieldControlProps {
  field: FieldSpec
  /** Id of the row label element (aria-labelledby). */
  labelId?: string
  disabled?: boolean
  onChange: (value: FieldChangeValue) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
  className?: string
}

export function FieldControl({ field, ...rest }: FieldControlProps) {
  switch (field.kind) {
    case 'text':
      return field.multiline ? <TextAreaField field={field} {...rest} /> : <TextField field={field} {...rest} />
    case 'number':
      return <NumberField field={field} {...rest} />
    case 'select':
      return <SelectField field={field} {...rest} />
    case 'switch':
      return <SwitchField field={field} {...rest} />
    case 'segmented':
      return <SegmentedField field={field} {...rest} />
    case 'color':
      return <ColorField field={field} {...rest} />
    case 'slider':
      return <SliderField field={field} {...rest} />
    case 'array-list':
      return <ArrayField field={field} onChange={rest.onChange} className={rest.className} />
  }
}
