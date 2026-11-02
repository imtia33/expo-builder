/*
 * Extended registry entries — implemented per docs/04-component-registry.md §3.
 * One file per component; every id below is a locked contract referenced by
 * the insert toolbar, canvas hit-testing, the inspector and the code emitters.
 */
import type { RegistryEntry } from '../types'

import { ACTIVITYINDICATOR_ENTRY } from './activityindicator'
import { BLURVIEW_ENTRY } from './blurview'
import { BUTTON_ENTRY } from './button'
import { DIVIDER_ENTRY } from './divider'
import { FLATLIST_ENTRY } from './flatlist'
import { IMAGE_ENTRY } from './image'
import { LINEARGRADIENT_ENTRY } from './lineargradient'
import { SCROLLVIEW_ENTRY } from './scrollview'
import { SECTIONLIST_ENTRY } from './sectionlist'
import { SWITCH_ENTRY } from './switch'
import { TEXTINPUT_ENTRY } from './textinput'

export const DATA_ENTRIES: RegistryEntry[] = [
  TEXTINPUT_ENTRY,
  BUTTON_ENTRY,
  SCROLLVIEW_ENTRY,
  IMAGE_ENTRY,
  SWITCH_ENTRY,
  ACTIVITYINDICATOR_ENTRY,
  DIVIDER_ENTRY,
  LINEARGRADIENT_ENTRY,
  BLURVIEW_ENTRY,
  FLATLIST_ENTRY,
  SECTIONLIST_ENTRY
]

export {
  ACTIVITYINDICATOR_ENTRY,
  BLURVIEW_ENTRY,
  BUTTON_ENTRY,
  DIVIDER_ENTRY,
  FLATLIST_ENTRY,
  IMAGE_ENTRY,
  LINEARGRADIENT_ENTRY,
  SCROLLVIEW_ENTRY,
  SECTIONLIST_ENTRY,
  SWITCH_ENTRY,
  TEXTINPUT_ENTRY
}
