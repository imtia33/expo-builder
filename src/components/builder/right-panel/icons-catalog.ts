/*
 * Curated tab-icon catalog for the icon picker — every name VERIFIED against
 * @iconify-json/ph (bun -e "const j=require('@iconify-json/ph/icons.json');
 * console.log(!!j.icons['name'])"). Do not add unverified names.
 *
 * The picker's search box queries the FULL Phosphor set (all 9k+ icons,
 * Object.keys of icons.json); this list is only the curated default grid.
 */

export interface IconCategory {
  label: string
  icons: string[]
}

/** Bare Phosphor names (no `ph:` prefix — the picker adds it). */
export const CURATED_ICON_CATEGORIES: IconCategory[] = [
  {
    label: 'Navigation',
    icons: [
      'house',
      'house-simple',
      'compass',
      'map-pin',
      'map-trifold',
      'navigation-arrow',
      'signpost',
      'path',
      'crosshair',
      'arrow-u-up-left'
    ]
  },
  {
    label: 'Social',
    icons: [
      'chat-circle-text',
      'chat-teardrop-text',
      'chat-circle-dots',
      'bell',
      'bell-ringing',
      'envelope-simple',
      'paper-plane-tilt',
      'users-three',
      'user-circle',
      'user',
      'at',
      'share-network',
      'heart',
      'star',
      'thumbs-up',
      'smiley'
    ]
  },
  {
    label: 'Media',
    icons: [
      'camera',
      'image',
      'images',
      'video-camera',
      'film-strip',
      'music-note',
      'music-notes',
      'play',
      'pause',
      'headphones',
      'microphone',
      'speaker-high',
      'playlist',
      'broadcast',
      'skip-back',
      'skip-forward',
      'shuffle',
      'repeat',
      'record'
    ]
  },
  {
    label: 'Commerce',
    icons: [
      'shopping-bag',
      'shopping-cart',
      'storefront',
      'tag',
      'receipt',
      'credit-card',
      'wallet',
      'currency-circle-dollar',
      'percent',
      'package',
      'gift',
      'barcode',
      'coins',
      'bank',
      'piggy-bank'
    ]
  },
  {
    label: 'Data',
    icons: [
      'chart-line-up',
      'chart-bar',
      'chart-pie-slice',
      'trend-up',
      'arrow-up-right',
      'list',
      'list-dashes',
      'columns',
      'grid-four',
      'squares-four',
      'funnel',
      'magnifying-glass'
    ]
  },
  {
    label: 'Productivity',
    icons: [
      'gear-six',
      'gear',
      'bookmark-simple',
      'calendar-blank',
      'calendar-check',
      'calendar-plus',
      'clock',
      'timer',
      'sliders-horizontal',
      'wrench',
      'toolbox',
      'lifebuoy',
      'info',
      'question',
      'warning-circle',
      'seal-check'
    ]
  },
  {
    label: 'Files',
    icons: [
      'file-text',
      'files',
      'folder',
      'folder-open',
      'notebook',
      'note',
      'note-pencil',
      'pencil-simple',
      'clipboard-text',
      'clipboard',
      'copy-simple',
      'printer',
      'trash-simple',
      'archive'
    ]
  },
  {
    label: 'Nature',
    icons: [
      'sun',
      'moon-stars',
      'cloud-sun',
      'cloud',
      'drop',
      'thermometer-simple',
      'wind',
      'umbrella',
      'snowflake',
      'rainbow',
      'cloud-lightning',
      'cloud-rain',
      'waves',
      'mountains',
      'campfire',
      'tree-palm',
      'cactus',
      'plant',
      'flower',
      'flower-tulip',
      'leaf',
      'tree',
      'flower-lotus',
      'planet',
      'globe-simple',
      'anchor'
    ]
  },
  {
    label: 'Health',
    icons: [
      'heartbeat',
      'pulse',
      'pill',
      'first-aid-kit',
      'stethoscope',
      'syringe',
      'fork-knife',
      'person-simple-run',
      'person-simple-walk',
      'person-simple-bike',
      'person-simple-swim',
      'barbell'
    ]
  },
  {
    label: 'Devices',
    icons: [
      'device-mobile',
      'device-tablet',
      'laptop',
      'desktop',
      'monitor',
      'television',
      'keyboard',
      'mouse',
      'wifi-high',
      'bluetooth',
      'battery-high',
      'rss',
      'plug',
      'power'
    ]
  },
  {
    label: 'Fun',
    icons: [
      'lightning',
      'fire',
      'sparkle',
      'magic-wand',
      'rocket-launch',
      'airplane',
      'airplane-takeoff',
      'car',
      'bicycle',
      'footprints',
      'dog',
      'cat',
      'paw-print',
      'bird',
      'fish',
      'rabbit',
      'balloon',
      'mask-happy',
      'mask-sad'
    ]
  },
  {
    label: 'Food',
    icons: [
      'hamburger',
      'pizza',
      'coffee',
      'beer-bottle',
      'ice-cream',
      'cake',
      'bowl-food',
      'cooking-pot',
      'carrot',
      'bread',
      'egg',
      'wine',
      'martini',
      'beer-stein'
    ]
  },
  {
    label: 'Games',
    icons: [
      'game-controller',
      'dice-five',
      'puzzle-piece',
      'ticket',
      'confetti',
      'popcorn',
      'trophy',
      'medal',
      'target',
      'flag-banner',
      'flag-checkered',
      'soccer-ball',
      'basketball',
      'volleyball',
      'tennis-ball'
    ]
  },
  {
    label: 'Security',
    icons: [
      'lock-simple',
      'lock-open',
      'shield-check',
      'shield',
      'key',
      'fingerprint',
      'eye',
      'eye-slash',
      'scan',
      'qr-code'
    ]
  },
  {
    label: 'Learning',
    icons: [
      'phone',
      'phone-call',
      'megaphone',
      'newspaper',
      'book-open',
      'books',
      'graduation-cap',
      'student',
      'chalkboard-teacher'
    ]
  },
  {
    label: 'UI',
    icons: [
      'arrow-left',
      'arrow-right',
      'arrow-up',
      'arrow-down',
      'arrows-out-simple',
      'check-circle',
      'x-circle',
      'prohibit',
      'plus-circle',
      'minus-circle',
      'dots-three',
      'dots-three-circle',
      'caret-down',
      'caret-up',
      'caret-right',
      'caret-left',
      'circle',
      'square',
      'triangle',
      'diamond',
      'hexagon',
      'star-four',
      'octagon',
      'seal'
    ]
  },
  {
    label: 'Home',
    icons: [
      'buildings',
      'house-line',
      'warehouse',
      'door',
      'bed',
      'bathtub',
      'couch',
      'lamp',
      'armchair',
      'baby',
      'train',
      'bus',
      'jeep',
      'scooter',
      'traffic-cone',
      'road-horizon',
      'traffic-sign'
    ]
  }
]

/** Flat curated list (bare names), deduplicated and order-stable. */
export const CURATED_ICONS: string[] = Array.from(new Set(CURATED_ICON_CATEGORIES.flatMap((c) => c.icons)))

/** Category of a curated bare name (first match wins). */
export function categoryOfIcon(name: string): string | undefined {
  return CURATED_ICON_CATEGORIES.find((c) => c.icons.includes(name))?.label
}
