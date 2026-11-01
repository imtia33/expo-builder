'use client'

/*
 * Simple field controls: text input, textarea, dropdown select, switch, segmented control.
 * Each renders one FieldSpec kind with the ported open-pencil themes:
 *   text     → input/input.ts (tone panel, size xs)
 *   textarea → input/textarea.ts, sized for the panel
 *   select   → select/select.ts slot strings
 *   switch   → toggle/switch.ts (Radix switch, size sm, mixed variant)
 *   segmented→ select/segmented-control.ts (radiogroup with roving tabindex)
 *
 * UNSET vs EXPLICIT (the inspector's core contract): a spec whose `value` is
 * undefined renders the effective default as a GHOST — muted text in selects,
 * placeholder text in inputs — so inherited registry defaults stay visibly
 * different from values the user committed.
 */

import { useState } from 'react'
import * as React from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { tv } from 'tailwind-variants'
import { SlotIcon } from '@/components/builder/icons/slots'

import inputTheme from '@/app/theme/input/input'
import textareaTheme from '@/app/theme/input/textarea'
import segmentedControlTheme from '@/app/theme/select/segmented-control'
import switchTheme from '@/app/theme/toggle/switch'
import { floatingSurface } from '@/app/theme/overlay'
import { panelFieldBase } from '@/app/theme/panel/field/base'
import { IconifyIcon } from '@/components/builder/icons'
import { cn } from '@/lib/utils'
import {
  isMixed,
  type SelectFieldSpec,
  type SegmentedFieldSpec,
  type SwitchFieldSpec,
  type TextFieldSpec
} from '../schema'

const inputStyles = tv(inputTheme)
const segmentedStyles = tv(segmentedControlTheme)
const switchStyles = tv(switchTheme)
const textareaClass = tv(textareaTheme)()

function mixedAriaLabel(label: string, mixed: boolean): string {
  return mixed ? `${label}, mixed values` : label
}

/* ——— Text (commits on Enter/blur, Escape reverts) ——— */

export interface TextFieldProps {
  field: TextFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
}

export function TextField({ field, labelId, disabled = false, onChange, className }: TextFieldProps) {
  const mixed = isMixed(field.value)
  const committed = !mixed && typeof field.value === 'string' ? field.value : ''
  const [draft, setDraft] = useState(committed)
  const [focused, setFocused] = useState(false)

  // External updates (canvas, undo) sync while the field is not being edited.
  // React's derive-during-render pattern (no setState-in-effect).
  const [prevCommitted, setPrevCommitted] = useState(committed)
  if (committed !== prevCommitted) {
    setPrevCommitted(committed)
    if (!focused) setDraft(committed)
  }

  function commit() {
    setFocused(false)
    if (draft !== committed) onChange(draft)
  }

  const ghost =
    !mixed && committed === '' && field.defaultValue !== undefined ? String(field.defaultValue) : undefined

  return (
    <input
      type="text"
      disabled={disabled}
      className={cn(inputStyles({ tone: 'panel', size: 'xs', state: mixed ? 'mixed' : 'idle' }), className)}
      value={draft}
      placeholder={mixed ? '—' : (field.placeholder ?? ghost ?? '')}
      aria-labelledby={mixed ? undefined : labelId}
      aria-label={mixedAriaLabel(field.label, mixed)}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(committed)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/* ——— Textarea (multi-line content fields) ——— */

export interface TextAreaFieldProps {
  field: TextFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
}

export function TextAreaField({ field, labelId, disabled = false, onChange, className }: TextAreaFieldProps) {
  const mixed = isMixed(field.value)
  const committed = !mixed && typeof field.value === 'string' ? field.value : ''
  const [draft, setDraft] = useState(committed)
  const [focused, setFocused] = useState(false)

  const [prevCommitted, setPrevCommitted] = useState(committed)
  if (committed !== prevCommitted) {
    setPrevCommitted(committed)
    if (!focused) setDraft(committed)
  }

  function commit() {
    setFocused(false)
    if (draft !== committed) onChange(draft)
  }

  const ghost =
    !mixed && committed === '' && field.defaultValue !== undefined ? String(field.defaultValue) : undefined

  return (
    <textarea
      disabled={disabled}
      rows={field.rows ?? 2}
      className={cn(
        textareaClass,
        'min-h-11 w-full resize-y rounded-md border-border bg-panel-field px-2 py-1.5 text-[11px] leading-relaxed scrollbar-thin',
        className
      )}
      value={draft}
      placeholder={mixed ? '—' : (field.placeholder ?? ghost ?? '')}
      aria-labelledby={mixed ? undefined : labelId}
      aria-label={mixedAriaLabel(field.label, mixed)}
      autoComplete="off"
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(committed)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/* ——— Select (unset shows the default option as a muted ghost) ——— */

const selectTriggerClass = cn(panelFieldBase, 'flex w-full items-center justify-between text-[11px]')
const selectValueClass = 'min-w-0 flex-1 truncate text-left'
const selectChevronClass = 'ml-1 size-3 shrink-0 text-muted'
const selectContentClass = cn(
  'z-[110] overflow-hidden p-1 text-[11px]',
  floatingSurface,
  'max-h-[min(var(--radix-select-content-available-height),20rem)] min-w-[var(--radix-select-trigger-width)]',
  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
  'duration-150 motion-reduce:animate-none data-[state=closed]:animate-none'
)
const selectItemClass =
  'relative flex h-6 cursor-pointer items-center gap-2 rounded-md pr-2 pl-6 text-surface outline-none select-none data-[disabled]:pointer-events-none data-[highlighted]:bg-hover data-[disabled]:opacity-50'
const selectIndicatorClass = 'absolute inset-y-0 left-0 inline-flex w-6 items-center justify-center text-primary'

export interface SelectFieldProps {
  field: SelectFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
}

export function SelectField({ field, labelId, disabled = false, onChange, className }: SelectFieldProps) {
  const mixed = isMixed(field.value)
  const unset = !mixed && (field.value === undefined || field.value === '')
  const selected = !mixed && typeof field.value === 'string' ? field.value : ''
  const selectedLabel = field.options.find((option) => option.value === selected)?.label
  // Ghost: the effective default option, shown muted while the value is unset.
  const ghostValue =
    field.defaultValue !== undefined && !mixed && unset ? String(field.defaultValue) : undefined
  const ghostLabel = field.options.find((option) => option.value === ghostValue)?.label ?? ghostValue

  return (
    <SelectPrimitive.Root value={selected} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-labelledby={mixed ? undefined : labelId}
        aria-label={mixedAriaLabel(field.label, mixed)}
        className={cn(selectTriggerClass, (mixed || unset) && 'text-muted', className)}
      >
        <span className={selectValueClass}>{selectedLabel ?? ghostLabel ?? '—'}</span>
        <SelectPrimitive.Icon asChild>
          <SlotIcon slot="inspector.chevron-down" aria-hidden="true" className={selectChevronClass} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={4} className={selectContentClass}>
          <SelectPrimitive.Viewport className="p-0.5">
            {field.options.map((option) => (
              <SelectPrimitive.Item key={option.value} value={option.value} className={selectItemClass}>
                <span className={selectIndicatorClass}>
                  <SelectPrimitive.ItemIndicator>
                    <SlotIcon slot="inspector.check" aria-hidden="true" className="size-3" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

/* ——— Switch (unset shows the effective default state) ——— */

export interface SwitchFieldProps {
  field: SwitchFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: boolean) => void
  className?: string
}

export function SwitchField({ field, labelId, disabled = false, onChange, className }: SwitchFieldProps) {
  const mixed = isMixed(field.value)
  const checked = field.value === true || (field.value === undefined && field.defaultValue === true)
  const s = switchStyles({ size: 'sm', state: mixed ? 'mixed' : 'idle' })

  return (
    <SwitchPrimitive.Root
      checked={checked}
      disabled={disabled}
      onCheckedChange={onChange}
      aria-labelledby={mixed ? undefined : labelId}
      aria-label={mixedAriaLabel(field.label, mixed)}
      className={cn(s.root(), className)}
    >
      <SwitchPrimitive.Thumb className={s.thumb()} />
    </SwitchPrimitive.Root>
  )
}

/* ——— Segmented (radiogroup, roving tabindex, icons allowed on options) ——— */

export interface SegmentedFieldProps {
  field: SegmentedFieldSpec
  labelId?: string
  disabled?: boolean
  onChange: (value: string) => void
  className?: string
}

export function SegmentedField({ field, labelId, disabled = false, onChange, className }: SegmentedFieldProps) {
  const mixed = isMixed(field.value)
  // Unset → the effective default option is active (ghost), so the control still
  // shows one definite state without claiming an explicit value.
  const value =
    !mixed && typeof field.value === 'string'
      ? field.value
      : field.defaultValue !== undefined
        ? String(field.defaultValue)
        : undefined
  const s = segmentedStyles({ size: 'sm' })

  function select(optionValue: string) {
    if (optionValue !== value) onChange(optionValue)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowDown' && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp') {
      return
    }
    event.preventDefault()
    const count = field.options.length
    if (count === 0) return
    const currentIndex = field.options.findIndex((option) => option.value === value)
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const start = currentIndex === -1 ? (forward ? 0 : count - 1) : currentIndex
    const nextIndex = (start + (forward ? 1 : -1) + count) % count
    const next = field.options[nextIndex]
    select(next.value)
    const button = event.currentTarget.querySelector<HTMLButtonElement>(`[data-option="${next.value}"]`)
    button?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={mixed ? undefined : labelId}
      aria-label={mixedAriaLabel(field.label, mixed)}
      onKeyDown={handleKeyDown}
      className={cn(s.root(), 'w-full', className)}
    >
      {field.options.map((option, index) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (value === undefined && index === 0) ? 0 : -1}
            disabled={disabled}
            data-state={active ? 'on' : 'off'}
            data-option={option.value}
            title={option.label}
            onClick={() => select(option.value)}
            className={s.item()}
          >
            {option.icon ? (
              <IconifyIcon aria-hidden="true" icon={option.icon} className="size-3.5 shrink-0" />
            ) : null}
            {option.icon ? <span className="sr-only">{option.label}</span> : option.label}
          </button>
        )
      })}
    </div>
  )
}
