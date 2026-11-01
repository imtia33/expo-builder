/*
 * Navigation layout emission (docs/06 §3.1/§3.3 + Task 6-B locked file mapping).
 *
 * Root — app/_layout.tsx: GestureHandlerRootView → SafeAreaProvider → <StatusBar> →
 * <Stack screenOptions={{ headerShown: false, contentStyle: … }}>. One
 * <Stack.Screen name="X" /> per root-level entry in MODEL ORDER (groups by
 * group.order, then standalone screens by screen.order). Plus
 * `export const unstable_settings = { anchor: '<first entry>' }` — `anchor`
 * is the current expo-router API (layoutAnchor.js); initialRouteName is the
 * deprecated alias and is never emitted.
 *
 * Groups — app/(${dirName})/_layout.tsx (stack|tabs only; 'none' groups are
 * transparent — no layout file, and at the root navigator their screens appear
 * with the GROUP-PREFIXED route name '(dir)/route', because expo-router hoists
 * layout-less directories onto the parent navigator while keeping the group
 * segment in the child route name — verified against expo-router@58.0.29
 * getRoutesCore.flattenDirectoryTreeToRoutes + useScreens.routeToScreen):
 *   - tabs: <Tabs> + one <Tabs.Screen name options={{ title, tabBarIcon }}> per
 *     screen in model order; screenOptions from TabsNavConfig; tab icons map
 *     through iconifyToPhosphorReact → phosphor-react-native.
 *   - stack: <Stack> + one <Stack.Screen name options={{ title }}> per screen
 *     in model order; screenOptions from StackNavConfig.
 */

import type { Screen, ScreenGroup, TabsNavConfig, StackNavConfig, TabItemConfig } from '@/lib/project/types'

import { printValue, RawCode } from './format'
import { iconifyToPhosphorReact } from './icons'
import { ImportCollector } from './imports'
import { el, elChild, renderElement, styleAttr, stringAttr } from './jsx'
import type { JsxAttr, JsxElement } from './jsx'

/**
 * The Phosphor React Native package on npm (verified: 'phosphor-react-native'
 * exists — latest 3.0.6, exports PascalCase icons like House/GearSix; the
 * '@phosphor-icons/react-native' scoped name does NOT exist on the registry).
 * Peer dep of generated projects: react-native-svg.
 */
const PHOSPHOR_RN_MODULE = 'phosphor-react-native'

/** `export const unstable_settings = …` — column where the object literal starts. */
const UNSTABLE_SETTINGS_COL = 'export const unstable_settings = '.length

function unstableSettingsLine(anchor: string): string {
  return `export const unstable_settings = ${printValue({ anchor }, UNSTABLE_SETTINGS_COL)};`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Root layout
 * ──────────────────────────────────────────────────────────────────────────── */

export function renderRootLayout(entryNames: string[]): string {
  const imports = new ImportCollector()
  imports.addNamed('expo-router', 'Stack')
  imports.addNamed('expo-status-bar', 'StatusBar')
  imports.addNamed('react-native-gesture-handler', 'GestureHandlerRootView')
  imports.addNamed('react-native-safe-area-context', 'SafeAreaProvider')

  const stack = el(
    'Stack',
    [
      {
        name: 'screenOptions',
        value: { kind: 'raw', value: { headerShown: false, contentStyle: { backgroundColor: '#ffffff' } } },
      },
    ],
    entryNames.map((name) => elChild(el('Stack.Screen', [stringAttr('name', name)])))
  )

  const root = el(
    'GestureHandlerRootView',
    [styleAttr({ flex: 1 })],
    [
      elChild(
        el('SafeAreaProvider', [], [
          elChild(el('StatusBar', [stringAttr('style', 'auto')])),
          elChild(stack),
        ])
      ),
    ]
  )

  const lines: string[] = []
  lines.push(...imports.render())
  lines.push('')
  lines.push(unstableSettingsLine(entryNames[0]))
  lines.push('')
  lines.push('export default function RootLayout() {')
  lines.push('  return (')
  lines.push(...renderElement(root, 4))
  lines.push('  );')
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Tabs group layout
 * ──────────────────────────────────────────────────────────────────────────── */

export function renderTabsLayout(group: ScreenGroup, cfg: TabsNavConfig, screens: Screen[]): string {
  const itemsByScreen = new Map<string, TabItemConfig>(cfg.items.map((it) => [it.screenId, it] as [string, TabItemConfig]))
  const usedIcons = new Set<string>()

  // Per-tab options; JSX child order == model screen order (expo-router
  // getSortedChildren matches declared children first, in order).
  const tabsScreens: JsxElement[] = screens.map((s) => {
    const item = itemsByScreen.get(s.id)
    const labelText = (item?.label ?? '').trim()
    const title = labelText.length > 0 ? labelText : s.name
    const icon = item?.icon ? iconifyToPhosphorReact(item.icon) : ''
    if (icon) usedIcons.add(icon)
    const options: Record<string, unknown> = icon
      ? { title, tabBarIcon: new RawCode(`({ color }) => <${icon} color={color} size={${cfg.iconSize}} />`) }
      : { title }
    return el('Tabs.Screen', [stringAttr('name', s.route), { name: 'options', value: { kind: 'raw', value: options } }])
  })

  const customBar = cfg.impl === 'custom'
  const customBarName = customBar ? `${pascalLayoutName(group.dirName)}TabBar` : null

  const imports = new ImportCollector()
  imports.addNamed('expo-router', 'Tabs')
  if (customBar && customBarName) {
    // app/(dir)/_layout.tsx → project root → components/
    imports.addNamed(`../../components/${customBarName}`, customBarName)
  }
  for (const icon of [...usedIcons].sort()) imports.addNamed(PHOSPHOR_RN_MODULE, icon)

  const tabBarStyle: Record<string, unknown> = {
    backgroundColor: cfg.barBackground,
    height: cfg.barHeight,
  }
  if (cfg.showTopBorder) {
    tabBarStyle.borderTopColor = cfg.borderTopColor
    tabBarStyle.borderTopWidth = cfg.borderTopWidth
  }

  // Custom implementation: the bar's VISUALS live in the generated component
  // (components/<Dir>TabBar.tsx) — the navigator only keeps what it still
  // owns: where the bar sits. Native implementation: platform bar styled
  // through screenOptions, exactly as before.
  const screenOptions: Record<string, unknown> = customBar
    ? { tabBarPosition: cfg.position }
    : {
        tabBarActiveTintColor: cfg.activeColor,
        tabBarInactiveTintColor: cfg.inactiveColor,
        tabBarShowLabel: cfg.showLabels,
        tabBarPosition: cfg.position,
        tabBarStyle,
        tabBarLabelStyle: { fontSize: cfg.labelSize, fontWeight: cfg.labelWeight },
      }

  const tabsAttrs: JsxAttr[] = [
    { name: 'screenOptions', value: { kind: 'raw', value: screenOptions } },
    ...(customBar && customBarName
      ? ([{ name: 'tabBar', value: { kind: 'raw' as const, value: new RawCode(`(props) => <${customBarName} {...props} />`) } }] satisfies JsxAttr[])
      : [])
  ]

  const tabs = el('Tabs', tabsAttrs, tabsScreens.map((t) => elChild(t)))

  const componentName = `${pascalLayoutName(group.dirName)}Layout`
  const lines: string[] = []
  lines.push(...imports.render())
  lines.push('')
  lines.push(unstableSettingsLine(screens[0].route))
  lines.push('')
  lines.push(`export default function ${componentName}() {`)
  lines.push('  return (')
  lines.push(...renderElement(tabs, 4))
  lines.push('  );')
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Custom tab bar component (impl === 'custom')
 * ──────────────────────────────────────────────────────────────────────────── */

/** Exported component name for a group's generated custom tab bar. */
export function customTabBarName(group: ScreenGroup): string {
  return `${pascalLayoutName(group.dirName)}TabBar`
}

/**
 * The generated `components/<Dir>TabBar.tsx` — the 'custom' tab bar
 * implementation (§4.3). Self-contained: the visual CONFIG + per-route META
 * live at the top (exactly the values the Navigation inspector edits), the
 * bar renders from react-navigation's tabBar props (`state`, `navigation`),
 * respects the safe-area bottom inset, and animates the active tab with
 * reanimated (spring / fade / none — capability-driven).
 *
 * Verified APIs: BottomTabBarProps from @react-navigation/bottom-tabs,
 * useSafeAreaInsets (react-native-safe-area-context), withSpring/withTiming/
 * useAnimatedStyle with an explicit deps array (reanimated 4.x), phosphor
 * icons accept { color, size, weight }.
 */
export function renderCustomTabBarComponent(
  group: ScreenGroup,
  cfg: TabsNavConfig,
  screens: Screen[]
): string {
  const itemsByScreen = new Map<string, TabItemConfig>(cfg.items.map((it) => [it.screenId, it] as [string, TabItemConfig]))
  const usedIcons = new Set<string>()

  // route → { label, Icon } rows in model order.
  const metaRows: string[] = []
  for (const s of screens) {
    const item = itemsByScreen.get(s.id)
    const label = (item?.label ?? '').trim() || s.name
    const icon = item?.icon ? iconifyToPhosphorReact(item.icon) : 'House'
    usedIcons.add(icon)
    metaRows.push(`  ${printValue(s.route, 2)}: { label: ${printValue(label, 4)}, Icon: ${icon} },`)
  }

  const c = cfg.custom
  const animation = c.animation

  const lines: string[] = []
  lines.push('/*')
  lines.push(` * ${customTabBarName(group)} — custom bottom tab bar for app/(${group.dirName})/.`)
  lines.push(' * Generated by ExpoForge from the group\'s Navigation inspector settings.')
  lines.push(' * Wired into the navigator through <Tabs tabBar={(props) => …}> in _layout.tsx.')
  lines.push(' */')
  lines.push(`import { Pressable, Text, View, type ComponentType } from 'react-native'`)
  lines.push(`import { useSafeAreaInsets } from 'react-native-safe-area-context'`)
  lines.push(`import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'`)
  lines.push(`import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'`)
  lines.push(`import { ${[...usedIcons].sort().join(', ')} } from '${PHOSPHOR_RN_MODULE}'`)
  lines.push('')
  lines.push('/** Visual configuration — every value is edited in ExpoForge\'s Navigation inspector. */')
  lines.push('const CONFIG = {')
  lines.push(`  activeColor: ${printValue(c.activeColor, 2)},`)
  lines.push(`  inactiveColor: ${printValue(c.inactiveColor, 2)},`)
  lines.push(`  barBackground: ${printValue(c.barBackground, 2)},`)
  lines.push(`  barHeight: ${c.barHeight},`)
  lines.push(`  showLabels: ${c.showLabels},`)
  lines.push(`  labelSize: ${c.labelSize},`)
  lines.push(`  labelWeight: ${printValue(c.labelWeight, 2)},`)
  lines.push(`  iconSize: ${c.iconSize},`)
  lines.push(`  showTopBorder: ${c.showTopBorder},`)
  lines.push(`  borderTopColor: ${printValue(c.borderTopColor, 2)},`)
  lines.push(`  borderTopWidth: ${c.borderTopWidth},`)
  lines.push(`  /** Active tab transition: 'spring' | 'fade' | 'none'. */`)
  lines.push(`  animation: ${printValue(animation, 2)},`)
  lines.push(`  springDamping: ${c.springDamping},`)
  lines.push(`  springStiffness: ${c.springStiffness},`)
  lines.push('} as const')
  lines.push('')
  lines.push('/** Per-route tab metadata: display label + Phosphor icon component. */')
  lines.push('const ROUTE_META: Record<string, { label: string; Icon: ComponentType<{ color?: string; size?: number }> }> = {')
  lines.push(...metaRows)
  lines.push('}')
  lines.push('')
  lines.push('/** One tab: icon (optionally animated) + label, colored by focus state. */')
  lines.push('function TabButton({')
  lines.push('  focused,')
  lines.push('  label,')
  lines.push('  Icon,')
  lines.push('  onPress,')
  lines.push('}: {')
  lines.push('  focused: boolean')
  lines.push('  label: string')
  lines.push('  Icon: ComponentType<{ color?: string; size?: number }>')
  lines.push('  onPress: () => void')
  lines.push('}) {')
  lines.push('  const animated = useAnimatedStyle(() => {')
  lines.push("    if (CONFIG.animation === 'spring') {")
  lines.push('      return {')
  lines.push('        transform: [')
  lines.push('          {')
  lines.push('            scale: withSpring(focused ? 1.15 : 1, {')
  lines.push('              damping: CONFIG.springDamping,')
  lines.push('              stiffness: CONFIG.springStiffness,')
  lines.push('            }),')
  lines.push('          },')
  lines.push('        ],')
  lines.push('      }')
  lines.push('    }')
  lines.push("    if (CONFIG.animation === 'fade') {")
  lines.push('      return { opacity: withTiming(focused ? 1 : 0.7, { duration: 160 }) }')
  lines.push('    }')
  lines.push('    return {}')
  lines.push('  }, [focused])')
  lines.push('')
  lines.push('  const color = focused ? CONFIG.activeColor : CONFIG.inactiveColor')
  lines.push('  return (')
  lines.push('    <Pressable')
  lines.push('      onPress={onPress}')
  lines.push('      style={{ flex: 1, alignItems: \'center\', justifyContent: \'center\', gap: 2 }}')
  lines.push('    >')
  lines.push('      <Animated.View style={animated}>')
  lines.push(`        <Icon color={color} size={CONFIG.iconSize} />`)
  lines.push('      </Animated.View>')
  lines.push('      {CONFIG.showLabels ? (')
  lines.push('        <Text')
  lines.push('          style={{')
  lines.push('            color,')
  lines.push('            fontSize: CONFIG.labelSize,')
  lines.push('            fontWeight: CONFIG.labelWeight,')
  lines.push('          }}')
  lines.push('        >')
  lines.push('          {label}')
  lines.push('        </Text>')
  lines.push('      ) : null}')
  lines.push('    </Pressable>')
  lines.push('  )')
  lines.push('}')
  lines.push('')
  lines.push(`export default function ${customTabBarName(group)}({ state, navigation }: BottomTabBarProps) {`)
  lines.push('  const insets = useSafeAreaInsets()')
  lines.push('  return (')
  lines.push('    <View')
  lines.push('      style={{')
  lines.push('        backgroundColor: CONFIG.barBackground,')
  lines.push('        borderTopWidth: CONFIG.showTopBorder ? CONFIG.borderTopWidth : 0,')
  lines.push('        borderTopColor: CONFIG.borderTopColor,')
  lines.push('        paddingBottom: insets.bottom,')
  lines.push('      }}')
  lines.push('    >')
  lines.push('      <View style={{ height: CONFIG.barHeight, flexDirection: \'row\' }}>')
  lines.push('        {state.routes.map((route, index) => {')
  lines.push('          const meta = ROUTE_META[route.name]')
  lines.push('          if (!meta) return null')
  lines.push('          const focused = index === state.index')
  lines.push('          const onPress = () => {')
  lines.push('            const event = navigation.emit({')
  lines.push("              type: 'tabPress',")
  lines.push('              target: route.key,')
  lines.push('              canPreventDefault: true,')
  lines.push('            })')
  lines.push('            if (!event.defaultPrevented) navigation.navigate(route.name)')
  lines.push('          }')
  lines.push('          return (')
  lines.push('            <TabButton')
  lines.push('              key={route.key}')
  lines.push('              focused={focused}')
  lines.push('              label={meta.label}')
  lines.push('              Icon={meta.Icon}')
  lines.push('              onPress={onPress}')
  lines.push('            />')
  lines.push('          )')
  lines.push('        })}')
  lines.push('      </View>')
  lines.push('    </View>')
  lines.push('  )')
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stack group layout
 * ──────────────────────────────────────────────────────────────────────────── */

export function renderStackLayout(group: ScreenGroup, cfg: StackNavConfig, screens: Screen[]): string {
  const imports = new ImportCollector()
  imports.addNamed('expo-router', 'Stack')

  const stack = el(
    'Stack',
    [
      {
        name: 'screenOptions',
        value: {
          kind: 'raw',
          value: {
            headerShown: cfg.headerShown,
            headerStyle: { backgroundColor: cfg.headerBg },
            headerTintColor: cfg.headerTintColor,
            headerTitleStyle: { color: cfg.headerTitleColor, fontSize: cfg.headerTitleSize },
            animation: cfg.animation,
            presentation: cfg.presentation,
          },
        },
      },
    ],
    screens.map((s) => elChild(el('Stack.Screen', [stringAttr('name', s.route), { name: 'options', value: { kind: 'raw', value: { title: s.name } } }])))
  )

  const componentName = `${pascalLayoutName(group.dirName)}Layout`
  const lines: string[] = []
  lines.push(...imports.render())
  lines.push('')
  lines.push(unstableSettingsLine(screens[0].route))
  lines.push('')
  lines.push(`export default function ${componentName}() {`)
  lines.push('  return (')
  lines.push(...renderElement(stack, 4))
  lines.push('  );')
  lines.push('}')
  return `${lines.join('\n')}\n`
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shared
 * ──────────────────────────────────────────────────────────────────────────── */

function pascalLayoutName(dirName: string): string {
  return dirName
    .split('-')
    .filter((seg) => seg.length > 0)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
}
