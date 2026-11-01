'use client'

/**
 * GroupDialog — creates a navigation group (and its screens) in one shot.
 *
 * Controlled component: `GroupDialog({ open, onOpenChange })`. Defaults are
 * seeded from the store every time it opens (next "Group N" / "Screen N"
 * numbering mirroring the store, last-used device), and the whole form is a
 * single <form> so Enter creates and Esc/Cancel dismiss (Radix handles Esc
 * and focus trapping).
 *
 * Fields: name → navigation type (Tabs / Stack / None cards; picking one
 * resets the screen-count default 3/2/1) → screens (stepper clamped 1–10 +
 * a live, inline-editable list of the names that will be created) → device
 * (from DEVICE_PRESETS, defaults to `ui.lastDeviceId`). A summary line
 * previews the route-group directory, screen count, and navigator exactly
 * like the store will materialize them.
 */
import { useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  DEVICE_PRESETS,
  deviceById,
  type PlatformId
} from '@/components/builder/screens/device-presets'
import { floatingSurface } from '@/app/theme/overlay'
import buttonTheme from '@/app/theme/button/button'
import { slugify, useProjectStore } from '@/lib/project/store'
import type { NavKind, ScreenGroup } from '@/lib/project/types'
import { PLATFORM_ICON } from '@/components/builder/left-panel/kind-icons'
import { SlotIcon, type IconSlot } from '@/components/builder/icons/slots'
import { cn } from '@/lib/utils'
import { tv } from 'tailwind-variants'

const buttonStyles = tv(buttonTheme)
const btnSubtle = buttonStyles({ color: 'neutral', variant: 'subtle', size: 'sm' }).base()
const btnPrimary = buttonStyles({ color: 'primary', variant: 'solid', size: 'sm' }).base()

const inputClasses =
  'h-7 w-full min-w-0 rounded-md border border-border bg-input px-2.5 text-xs text-surface outline-none hover:border-muted/60 focus:border-panel-focus focus:ring-1 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60'

const fieldLabelClasses = 'mb-1 block text-[11px] leading-none text-muted'

const stepperButtonClasses =
  'flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border border-border bg-transparent text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus disabled:cursor-not-allowed disabled:opacity-40'

interface NavOption {
  kind: NavKind
  label: string
  icon: IconSlot
  description: string
  defaultCount: number
}

const NAV_OPTIONS: NavOption[] = [
  {
    kind: 'tabs',
    label: 'Tabs',
    icon: 'dialog.nav.tabs',
    description: 'Tab navigation — a tab bar with one screen per tab',
    defaultCount: 3
  },
  {
    kind: 'stack',
    label: 'Stack',
    icon: 'dialog.nav.stack',
    description: 'Stack navigation — push screens with headers and back',
    defaultCount: 2
  },
  {
    kind: 'none',
    label: 'None',
    icon: 'dialog.nav.none',
    description: 'Layout group — organize screens without a navigator',
    defaultCount: 1
  }
]

const MIN_SCREENS = 1
const MAX_SCREENS = 10

/** "Group 4" / "Screen 7" → next number (mirrors the store's private helpers). */
function nextNumberedName(names: string[], prefix: string): number {
  let max = 0
  const pattern = new RegExp(`^${prefix} (\\d+)$`)
  for (const name of names) {
    const m = pattern.exec(name)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** Route-group dir preview, mirroring createGroup's name fallback + uniqueSlug(slugify(…)). */
function previewDirName(name: string, groups: Pick<ScreenGroup, 'dirName' | 'name'>[]): string {
  const effective =
    name.trim() || `Group ${nextNumberedName(groups.map((g) => g.name), 'Group')}`
  const base = slugify(effective).replace(/^-+|-+$/g, '') || 'group'
  const taken = new Set(groups.map((g) => g.dirName))
  let candidate = base
  let i = 2
  while (taken.has(candidate)) candidate = `${base}-${i++}`
  return candidate
}

export interface GroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function GroupDialog({ open, onOpenChange }: GroupDialogProps) {
  const groups = useProjectStore((s) => s.data.groups)
  const screens = useProjectStore((s) => s.data.screens)
  const createGroup = useProjectStore((s) => s.createGroup)

  const [name, setName] = useState('')
  const [navKind, setNavKind] = useState<NavKind>('tabs')
  const [count, setCount] = useState(3)
  /** Inline-edited screen names; '' (or missing) falls back to "Screen N". */
  const [screenNames, setScreenNames] = useState<string[]>([])
  const [deviceId, setDeviceId] = useState(DEVICE_PRESETS[0].id)
  const [wasOpen, setWasOpen] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)

  /*
   * Seed defaults from the store each time the dialog opens. Adjusting state
   * during render (the React-endorsed "reset state when a prop changes"
   * pattern) instead of in an effect: React discards the in-flight render and
   * re-renders immediately with the seeded values, so the first painted frame
   * is already correct. Focus is placed on the name input when the dialog
   * opens (see onOpenAutoFocus below), so Enter submits the form and creates.
   */
  if (open && !wasOpen) {
    const s = useProjectStore.getState()
    setWasOpen(true)
    setName(`Group ${nextNumberedName(s.data.groups.map((g) => g.name), 'Group')}`)
    setNavKind('tabs')
    setCount(3)
    setScreenNames([])
    setDeviceId(s.ui.lastDeviceId)
  } else if (!open && wasOpen) {
    setWasOpen(false)
  }

  const nextScreenNumber = useMemo(
    () => nextNumberedName(screens.map((s) => s.name), 'Screen'),
    [screens]
  )
  const navOption = NAV_OPTIONS.find((o) => o.kind === navKind) ?? NAV_OPTIONS[0]
  const dirName = useMemo(() => previewDirName(name, groups), [name, groups])

  function selectNav(option: NavOption) {
    setNavKind(option.kind)
    setCount(option.defaultCount)
    setScreenNames([])
  }

  function setCountSafe(next: number) {
    const clamped = Math.max(MIN_SCREENS, Math.min(MAX_SCREENS, Math.round(next)))
    setCount(clamped)
    setScreenNames((prev) => prev.slice(0, clamped))
  }

  function setScreenName(index: number, value: string) {
    setScreenNames((prev) => {
      const next = [...prev]
      while (next.length < index) next.push('')
      next[index] = value
      return next
    })
  }

  function handleCreate() {
    createGroup({
      name: name.trim(),
      navKind,
      screenCount: count,
      deviceId,
      screenNames: screenNames.slice(0, count)
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          // focus the first field (not the first tabbable, which is the ✕):
          // Enter in the name input then submits the form → Create group
          event.preventDefault()
          nameInputRef.current?.focus()
          nameInputRef.current?.select()
        }}
        className={cn(
          floatingSurface,
          'flex max-h-[min(90vh,44rem)] w-[min(30rem,92vw)] flex-col gap-0 overflow-hidden border-none p-0',
          'duration-[180ms] ease-out data-[state=closed]:duration-[120ms] data-[state=closed]:ease-in motion-reduce:duration-0'
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-sm font-semibold text-surface">New group</DialogTitle>
            <DialogDescription className="mt-0.5 text-xs text-muted">
              A route group with a navigator and its first screens.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Cancel"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded border-none bg-transparent text-muted outline-none hover:bg-hover hover:text-surface focus-visible:ring-1 focus-visible:ring-panel-focus"
          >
            <SlotIcon slot="dialog.close" className="size-3.5" aria-hidden />
          </DialogClose>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleCreate()
          }}
        >
          <div className="scrollbar-thin flex max-h-[min(64vh,36rem)] min-h-0 flex-col gap-4 overflow-y-auto p-4">
            <div>
              <label htmlFor="group-dialog-name" className={fieldLabelClasses}>
                Name
              </label>
              <input
                ref={nameInputRef}
                id="group-dialog-name"
                value={name}
                spellCheck={false}
                placeholder={`Group ${nextNumberedName(groups.map((g) => g.name), 'Group')}`}
                onChange={(event) => setName(event.target.value)}
                className={inputClasses}
              />
            </div>

            <fieldset>
              <legend className={cn(fieldLabelClasses, 'mb-1.5')}>Navigation</legend>
              <div role="radiogroup" aria-label="Navigation type" className="grid gap-1.5">
                {NAV_OPTIONS.map((option) => {
                  const active = option.kind === navKind
                  return (
                    <button
                      key={option.kind}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => selectNav(option)}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                        active
                          ? 'border-accent bg-accent/5'
                          : 'border-border hover:bg-hover'
                      )}
                    >
                      <SlotIcon
                        slot={option.icon}
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          active ? 'text-primary' : 'text-muted'
                        )}
                        aria-hidden
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="text-xs font-medium text-surface">{option.label}</span>
                        <span className="mt-0.5 text-[10px] leading-snug text-muted">
                          {option.description}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          'mt-px ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                          active ? 'border-accent bg-accent' : 'border-border'
                        )}
                      >
                        {active ? (
                          <SlotIcon slot="dialog.radio-check" className="size-2.5 text-on-accent" aria-hidden />
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className={cn(fieldLabelClasses, 'mb-0')}>Screens</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Fewer screens"
                    disabled={count <= MIN_SCREENS}
                    onClick={() => setCountSafe(count - 1)}
                    className={stepperButtonClasses}
                  >
                    <SlotIcon slot="dialog.stepper-minus" className="size-3" aria-hidden />
                  </button>
                  <span
                    className="w-6 text-center text-[11px] text-surface tabular-nums"
                    aria-live="polite"
                  >
                    {count}
                  </span>
                  <button
                    type="button"
                    aria-label="More screens"
                    disabled={count >= MAX_SCREENS}
                    onClick={() => setCountSafe(count + 1)}
                    className={stepperButtonClasses}
                  >
                    <SlotIcon slot="dialog.stepper-plus" className="size-3" aria-hidden />
                  </button>
                </div>
              </div>
              <ul className="grid gap-1">
                {Array.from({ length: count }, (_, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="w-4 shrink-0 text-right text-[10px] text-muted tabular-nums">
                      {i + 1}
                    </span>
                    <input
                      value={screenNames[i] ?? ''}
                      spellCheck={false}
                      placeholder={`Screen ${nextScreenNumber + i}`}
                      aria-label={`Name for screen ${i + 1}`}
                      onChange={(event) => setScreenName(i, event.target.value)}
                      className={cn(inputClasses, 'h-6 text-[11px]')}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label htmlFor="group-dialog-device" className={fieldLabelClasses}>
                Device
              </label>
              <Select value={deviceId} onValueChange={setDeviceId}>
                <SelectTrigger
                  id="group-dialog-device"
                  aria-label="Device preset"
                  className="h-7 w-full rounded-md border-border bg-input text-xs text-surface shadow-none hover:border-muted/60 focus-visible:ring-accent/25"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-border bg-popover text-popover-foreground">
                  {DEVICE_PRESETS.map((device) => (
                    <SelectItem
                      key={device.id}
                      value={device.id}
                      className="gap-2 text-xs"
                    >
                      <SlotIcon
                        slot={PLATFORM_ICON[device.platform as PlatformId]}
                        className="size-3 text-muted"
                        aria-hidden
                      />
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="rounded bg-panel-field px-2 py-1.5 text-[10px] leading-relaxed text-muted">
              <span className="text-surface">app/({dirName})/</span> · {count}{' '}
              {count === 1 ? 'screen' : 'screens'} · {navOption.label} ·{' '}
              {deviceById(deviceId).label}
            </p>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <DialogClose className={btnSubtle}>Cancel</DialogClose>
            <button type="submit" className={btnPrimary}>
              <SlotIcon slot="dialog.create" className="size-3" aria-hidden />
              Create group
            </button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
