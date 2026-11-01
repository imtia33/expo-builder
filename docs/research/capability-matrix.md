# ExpoForge Capability Matrix — Reference App Analysis

**Date:** research session · **Builder analyzed:** ExpoForge (`/home/z/my-project`)
**Reference apps:** Appwrite-Native, Crimson, TravelMate (shallow-cloned to `/home/z/my-project/research/`), Keystone (read-only at `/home/z/my-project/upload/keystone-extract/Keystone-main`)

> ⚠️ **z.ai-mobile could not be analyzed.** `https://github.com/imtia33/z.ai-mobile` returns **HTTP 404** (repo deleted, renamed, or private). Verified: direct clone fails, name variants (`zai-mobile`, `z-ai-mobile`, `zaimobile`, `z-ai-mobile-app`, `zai`) all 404, and the account's public repository listing contains no matching repo. Its column is marked **N/A** throughout; capability counts are reported as **X/4** (analyzable apps only). The name suggests it may have been an AI-chat/streaming app — if it reappears, re-run this analysis for the "chat/streaming" rows.

---

## 1. Per-App Findings (with file-path evidence)

### 1.1 Appwrite-Native — Appwrite Cloud console client (the most complex app)
Path: `research/Appwrite-Native/` · 214 source files

| Area | Findings | Evidence |
|---|---|---|
| **Stack** | Expo 54, RN 0.81.5, expo-router v6, NativeWind v4, TS+JS mixed, `@appwrite.io/console` SDK, zustand, @rn-primitives (24 pkgs), lucide-react-native, react-native-reanimated 4 + worklets, react-native-svg, cva | `package.json` |
| **Navigation** | Root `Stack` with per-screen transition animations (`fade_from_bottom`, `slide_from_right`, `fade`); `(auth)` group stack; `Slot` layout for Project; **4 material-top-tab navigators with fully custom tab bars** (scrollable org-switcher bar, custom TabSwitcher); auth-gate splash that restores "last view" from AsyncStorage | `app/_layout.jsx`, `app/(auth)/_layout.jsx`, `app/Project/_layout.jsx`, `app/Organization/_layout.jsx`, `app/sites/_layout.jsx`, `app/profile/_layout.jsx`, `app/index.jsx` |
| **Lists** | FlatList in a 505-line virtualized DataTable (memoized rows, sticky column via `Animated` scrollX translate, column config, row selection), sites list, user/team pickers | `components/blocks/DataTable.jsx`, `components/ProjectScreens/sites/sites.jsx`, `components/TablesScreens/modal/SelectUsersModal.jsx`, `SelectTeamsModal.jsx` |
| **Data/API** | Appwrite console SDK wrapped in typed service modules; **zustand stores** (`organizationStore`, `projectStore`, `settingsStore`, `usageStore`) with AsyncStorage persistence; React Context for session; **polling** for processing messages; pagination with `Query` | `appwrite/auth/auth.ts`, `appwrite/store/organizationStore.ts` (289 lines), `context/appwriteContext.js`, `components/ProjectScreens/messaging/messages.jsx` |
| **Auth** | Email/password session, signup, logout, identity listing, GitHub OAuth (web-browser + linking), splash-gate redirect to login, session restore | `appwrite/auth/auth.ts`, `app/index.jsx`, `app/(auth)/login.jsx` |
| **Forms** | Login/signup forms (Label+Input primitives, inline validation, `Alert` errors, submitting state, `KeyboardAvoidingView`, `keyboardShouldPersistTaps`), Create Table/Row/Member modals | `app/(auth)/login.jsx`, `app/(auth)/sign-up.jsx`, `components/databases/CreateTableModal.jsx`, `components/TablesScreens/modal/CreateRowModal.jsx` |
| **Chat** | Not end-user chat — messaging is a **console admin UI** (email/SMS/push provider config + message DataTable + failed-message modal) | `components/ProjectScreens/messaging/messages.jsx` + `modals/` |
| **Maps** | None | — |
| **Gestures** | Swipeable top tabs (pager-view), dropdown menus, haptic feedback patterns | `app/Organization/_layout.jsx` (`swipeEnabled`), `app/settings.jsx` (`Haptics.notificationAsync/selectionAsync/impactAsync`) |
| **Animations** | Reanimated 4 configured at root; core `Animated` in DataTable sticky column & login loading; custom SVG chart; screen transition animations | `app/_layout.jsx` (configureReanimatedLogger), `components/blocks/DataTable.jsx`, `components/ui/SmoothLineChart.jsx` |
| **Custom inputs** | **Full shadcn-style UI kit: 30+ components** (accordion, alert-dialog, avatar, checkbox, dropdown-menu, popover, radio-group, select, table, tabs, tooltip, skeleton, textarea…) on @rn-primitives + cva | `components/ui/*` (33 files), `components/blocks/DataTable.jsx` |
| **State mgmt** | zustand (4 stores) + React Context + AsyncStorage | `appwrite/store/*.ts`, `context/appwriteContext.js` |
| **Keyboard** | `KeyboardAvoidingView` in auth screens and create-modals; `keyboardShouldPersistTaps="handled"` | `app/(auth)/login.jsx:4,66-68` |
| **Native modules** | haptics, clipboard, document-picker (file import in table rows), file-system, sharing, web-browser, navigation-bar, splash-screen, fonts (Poppins ×9), svg, pager-view, gesture-handler, safe-area | `app/settings.jsx`, `components/TablesScreens/rows.jsx:32,554`, `package.json` |
| **Theme** | Dark/light theme context persisted to AsyncStorage + custom @react-navigation themes | `lib/theme-context.js`, `app/_layout.jsx` |

### 1.2 Crimson — blood-donation social app
Path: `research/Crimson/`

| Area | Findings | Evidence |
|---|---|---|
| **Stack** | Expo 52, RN 0.76.9, expo-router v4, NativeWind v2, `react-native-appwrite` 0.6, react-native-animatable, toast-message, datetimepicker (expo-av declared but unused in code) | `package.json` |
| **Navigation** | Root Stack with `excess/*` detail screens; **material-top-tabs repurposed as a floating bottom tab bar** (absolute positioning, ripple, custom indicator, labels hidden); auth guard via `<Redirect>` | `app/_layout.jsx`, `app/(tabs)/_layout.jsx:40-103` |
| **Lists** | FlatList for donor search results, donation-request feed, profile lists; pull-to-refresh (`RefreshControl`) on Home + Requests + Profile | `app/excess/search.jsx:149`, `app/(tabs)/requests.jsx:225`, `app/(tabs)/profile.jsx:428` |
| **Data/API** | Appwrite Databases/Storage/Functions/Avatars SDK; 10 collections (users, messages, tokens, orgs, images, members, member-requests, group-chat); `useAppwrite` fetch hook; cloud-function push notifications | `lib/appwrite.js` (617 lines, 10 collection IDs, `sendMessages`, `sendReplying`, `checkOldMessages`, `getUserToken`, `sendNotification`), `lib/useAppwrite.js` |
| **Auth** | Sign-in/sign-up, email verification (`account.createVerification`), Appwrite session in GlobalProvider | `app/(auth)/sign-in.jsx`, `context/GlobalProvider.js`, `lib/appwrite.js:46-54` |
| **Forms** | Custom `FormField` (password visibility toggle), `CustomButton`, multi-field donation-request form with **chip selectors** (blood group/type), date + time pickers, validation + toasts | `components/FormField.jsx`, `app/(tabs)/create.jsx` (347 lines) |
| **Chat** | **Group chat implemented as Appwrite documents** (message feed rendered in FlatList with sender alignment, reply-to, interest/handshake actions, delete modal). No dedicated chat route file (`excess/community` referenced but absent) — feed lives in requests tab | `lib/appwrite.js:55-108,556`, `app/(tabs)/requests.jsx:225-280` |
| **Maps** | None | — |
| **Gestures** | `onLongPress` to copy phone number (Clipboard + Toast); swipe tabs; long-press interests | `app/excess/search.jsx:35-38` |
| **Animations** | Core `Animated`: typewriter `TypingText` component (letter-by-letter + blinking cursor via interpolate), switch scale animation; animatable declared | `components/TypingText.jsx`, `app/(tabs)/home.jsx:21,59-62,84-88` |
| **Custom inputs** | FormField w/ secure-text toggle; blood-group chip selector; time/date pickers | `components/FormField.jsx`, `app/(tabs)/create.jsx` |
| **State mgmt** | React Context only (`GlobalProvider`: user, isLogged, loading) | `context/GlobalProvider.js` |
| **Keyboard** | **None** (no KeyboardAvoidingView / keyboardShouldPersistTaps anywhere) | grep: 0 matches |
| **Native modules** | clipboard, toast-message, datetimepicker, linking, device, document-picker (declared, unused) | `package.json`, `app/excess/search.jsx` |
| **Other** | RN core `Modal` for delete/interest confirmations; deep-link password-reset params pattern | `app/(tabs)/requests.jsx:352`, `app/verifying.jsx`-style reset in TravelMate |

### 1.3 TravelMate (travX) — map-based travel/navigation app
Path: `research/TravelMate/`

| Area | Findings | Evidence |
|---|---|---|
| **Stack** | Expo 54, RN 0.81.5, expo-router v6, `react-native-appwrite` 0.18, **react-native-maps 1.20**, expo-location, **expo-sqlite**, react-native-webview, animatable, toast-message | `package.json` |
| **Navigation** | Root Stack (per-screen animations: `slide_from_bottom`, `fade_from_bottom`); expo-router `Tabs` with **fully hand-rolled tab bar** (Animated height, hides on keyboard, Animatable bounceIn/fadeIn icons, active indicator line, ripple); params passed as JSON via `router.push` | `app/_layout.jsx:54-62`, `app/(tabs)/_layout.jsx:139-278` |
| **Lists** | **3 horizontal FlatLists on Home** (Tourism / HealthCares / Foods); FlatList inside SearchModal, ModernDropdown, CustomDropdown, HistoryPicker, PlaceDirection (turn-by-turn steps) | `app/(tabs)/home.jsx:270,293,313`, `components/SearchModal.jsx:280`, `components/PlaceDirection.jsx:211` |
| **Data/API** | Appwrite paginated fetch (`Query.limit(45).offset(n)`); **SQLite local database synced from cloud** (routes/locations/fares/saved-places tables, offset bookkeeping in AsyncStorage, WAL mode); custom pathfinder graph library (Dijkstra-style shortest path, top-3 routes, polyline decode, fare calc) | `lib/db.js`, `lib/dbInsert.js:26-58`, `app/_layout.jsx:68-112` (schema + SQLiteProvider), `lib/pathfinder.js` |
| **Auth** | Sign-in/sign-up + **deep-link password reset** (`verifying.jsx` consumes `userId/secret/expire` params) | `app/(auth)/`, `app/verifying.jsx:17-50` |
| **Forms** | FormField, CustomDropdown, ModernDropdown (FlatList-in-modal selects), search bar with live filtering | `components/FormField.jsx`, `components/ModernDropdown.jsx`, `components/CustomDropdown.jsx` |
| **Chat** | None | — |
| **Maps** | **Map-centric app:** `MapView` (PROVIDER_GOOGLE), `Marker` (custom callouts), `Polyline`, `Circle`, `AnimatedRegion`, `UrlTile` (custom OSM tiles), `animateCamera`, expo-location permission + current location, **Google Maps route preview inside a WebView**, `Linking` out to maps | `app/(tabs)/route.jsx:22-30,100-111,626`, `app/travelplaces.jsx:18,113`, `lib/pathfinder.js` |
| **Gestures** | **PanResponder drag-to-dismiss bottom sheets** (×2), map marker `onLongPress`, result long-press, swipe tabs | `components/BottomSheet.jsx:27`, `components/RouteBottomSheet.jsx:45`, `app/(tabs)/route.jsx:626` |
| **Animations** | Core `Animated`: slide-in sidebar (custom drawer), tab-bar height, parallax/scale card carousel (scrollX interpolation), camera animation; Animatable icon transitions | `app/(tabs)/home.jsx:359+`, `components/ExpandingCardSlider.jsx:16-48`, `app/(tabs)/_layout.jsx:104-121` |
| **Custom inputs** | Search modal (search-as-type), dropdowns, history picker | `components/SearchModal.jsx`, `components/ModernDropdown.jsx` |
| **State mgmt** | React Context ×2 (GlobalProvider auth/places, ThemeProvider dark/light) + AsyncStorage + SQLite | `context/GlobalProvider.js`, `context/ThemeProvider.js` |
| **Keyboard** | `KeyboardAvoidingView` (reset screen), **Keyboard listeners that hide the tab bar** (keyboardWillShow/DidShow, platform-conditional) | `app/verifying.jsx:81`, `app/(tabs)/_layout.jsx:217-231` |
| **Native modules** | maps, location, sqlite, webview, file-system, navigation-bar, toast, fonts (18 custom incl. script fonts) | `package.json`, `app/_layout.jsx:8-27` |

### 1.4 Keystone (HRMS / "UniferaHR") — design-system-driven HR app (WIP)
Path: `upload/keystone-extract/Keystone-main/` (READ-ONLY) · NOTE: active `app/` currently contains only a placeholder `index.jsx`; the real screens live in `oldhrms-trash/` (kept as reference per `RULE.md`) — the app is early-stage but its patterns are explicit.

| Area | Findings | Evidence |
|---|---|---|
| **Stack** | **Expo 57 / RN 0.86.2 / expo-router 57** (newest), `heroui-native` (HeroUI for RN), `uniwind` (NativeWind successor), @expo/ui, @gorhom/bottom-sheet, axios (declared, not yet used), cva + tailwind-variants, reanimated 4.5 + worklets, expo-image/blur/haptics | `package.json` |
| **Navigation** | Root Stack; `(auth)` group stack with `slide_from_right`; router.replace to `/(tabs)` after login (tabs not yet built) | `app/_layout.jsx`, `oldhrms-trash/(auth)/_layout.jsx`, `oldhrms-trash/(auth)/login.jsx:62` |
| **Lists** | None yet (app is pre-list); HRMS domain implies employee/leave lists to come. Calendar renders a data-driven grid instead | `components/ui/calendar.tsx` |
| **Data/API** | axios declared for future API; AsyncStorage for theme persistence only | `package.json:30`, `lib/theme-context.js:36` |
| **Auth** | Login (email/password, remember-me, show/hide password), **admin vs employee register flows**, **6-slot OTP email verification in a bottom sheet**, creating-account toast; sign-in currently mocked with `setTimeout` (backend not wired) | `oldhrms-trash/(auth)/login.jsx`, `oldhrms-trash/(auth)/admin-register.jsx`, `components/auth/OtpBottomSheet.tsx:68-87`, `components/auth/CreatingAccountToast.tsx` |
| **Forms** | heroui-native form composition: `TextField/Input/Label/Description/FieldError/ControlField/Checkbox/Spinner/PressableFeedback`; inline regex validation with error states | `oldhrms-trash/(auth)/login.jsx:47-55,126-150` |
| **Chat** | None | — |
| **Maps** | None | — |
| **Gestures** | **952-line dumb Calendar component with long-press-and-drag range resizing** (PanResponder, live preview); bottom-sheet drag (expo-ui + @gorhom) | `components/ui/calendar.tsx:30-45,67`, `components/ui/DetachedBottomSheet.tsx` |
| **Animations** | Reanimated entering animations (`FadeIn`, `FadeInUp` with delays); frosted-glass card (blur); LinearGradient brand gradient; `skills/animate-expo-SKILL.md` codifies the whole animation discipline (Reanimated 4 worklets, CSS transitions, layout animations, `formSheet` presentation, `react-native-keyboard-controller`, haptics recipes) | `oldhrms-trash/(auth)/login.jsx:88,106,122`, `components/auth/FrostedCard.jsx`, `skills/animate-expo-SKILL.md` |
| **Custom inputs** | OTP input (6 slots + separator), frosted card, detached bottom sheet, theme toggle, SVG logo mark, icon wrapper | `components/auth/OtpBottomSheet.tsx`, `components/ui/*`, `components/ThemeToggle.jsx` |
| **State mgmt** | Theme context (light/dark, AsyncStorage, splash waits for theme load) | `lib/theme-context.js` |
| **Keyboard** | `keyboardShouldPersistTaps="handled"` on every form/scroll view; safe-area insets; **`react-native-keyboard-controller` mandated by the skill doc** (not yet installed) | `oldhrms-trash/(auth)/login.jsx:84`, `skills/animate-expo-SKILL.md:84` |
| **Native modules** | blur, linear-gradient, image, haptics (declared), svg, gesture-handler, reanimated, worklets, @expo/ui, edge-to-edge (`app.json`) | `package.json`, `components/auth/FrostedCard.jsx` |
| **Theme** | Token-based theme system (`text-foreground`, `bg-surface-*`, `border-border`) + dark/light persistence — strict "no hardcoded colors" rule | `RULE.md`, `lib/theme-context.js` |

---

## 2. THE MATRIX

Legend per app column: ✔ used / ◐ light or partial use / ✖ not used · Builder column: ✔ full support / ◐ partial / ✖ missing

| # | Capability area | Appwrite-Native | Crimson | TravelMate | Keystone | z.ai-mobile | **ExpoForge today** | What's actually needed to close the gap |
|---|---|---|---|---|---|---|---|---|
| 1 | **Complex navigation** (groups, nested stacks, custom tab bars, transitions) | ✔ Stack+per-screen animations, 4× custom top-tab bars, `Slot` | ✔ Stack + floating bottom tab bar (top-tabs hack) | ✔ Stack animations + hand-rolled tab bar | ✔ Stack group + slide transitions | N/A | ◐ Screen groups with Stack (configurable header) / Tabs (native or custom bar) exist & generate real expo-router — but **no per-screen transition/presentation options** (`slide_from_right`, `fade`, `formSheet`), no top-tab variant, no custom-tab-bar composition (org switcher, floating pill), no `Slot` groups | Add screen-level options: `animation`, `presentation` (modal/formSheet), `headerLargeTitle`; add "top tabs" nav kind (material-top-tabs/pager); allow tab-bar slot composition (put any node inside custom tab bar) |
| 2 | **Nested layouts** (tabs inside stack, group layouts, conditional layouts) | ✔ `(auth)` stack → Project `Slot` → top-tabs → modals | ✔ Stack → (tabs) → detail screens | ✔ Stack → Tabs → map screen w/ sheets | ✔ Stack → (auth) → sheets (tabs pending) | N/A | ◐ Groups + Stack/Tabs nesting is structurally generatable, but no `Slot` layout kind, no auth-guard redirect logic, no layout-level providers | `Slot` layout option; "guard" property on groups (redirect rule); provider wrappers per group |
| 3 | **Reusable components / variants** | ✔ 30+ component UI kit (cva variants) | ✔ FormField/CustomButton/Loader/TypingText | ✔ 16 shared components | ✔ auth/ui component folders + heroui-native | N/A | ✖ No custom-component or variant system; screens are one-off node trees | Component extraction ("create component from selection"), instances with prop overrides, variant props (map to cva), component library panel |
| 4 | **Dynamic lists** (FlatList/SectionList + item templates) | ✔ DataTable + pickers | ✔ search/requests/profile feeds + RefreshControl | ✔ 3 horizontal carousels + 5 more lists | ✖ (none yet) | N/A | ✖ **No list components at all** | FlatList + SectionList insertables: data-source binding, `renderItem` template editing (child nodes with `item` bindings), horizontal mode, pull-to-refresh, `keyExtractor`, separators, empty state; list virtualization preview on canvas |
| 5 | **API-driven content** (fetch, cache, loading/error states) | ✔ SDK + zustand stores + AsyncStorage + polling | ✔ Appwrite collections + hook | ✔ Appwrite + SQLite sync engine | ◐ axios declared, mock only | N/A | ✖ No data binding or API integration | Data-source layer (REST + Appwrite adapter), bind response arrays to lists/images/text, loading/error/empty states wired to components, request lifecycle (on-mount / on-refresh / manual), simple client cache |
| 6 | **Authentication** | ✔ login/signup/OAuth/session-restore gate | ✔ sign-in/up + email verification + guard | ✔ sign-in/up + deep-link reset | ✔ login/2 registers + OTP sheet | N/A | ✖ No auth logic (visual login screens can be drawn but nothing works) | Auth flow templates (email/password + OAuth buttons), session state, guarded groups (redirect unauthenticated), email-verify/reset deep-link screens; backend wiring needs the data layer from #5 |
| 7 | **Forms** (multi-field, validation, pickers) | ✔ login/signup/create modals | ✔ request form + chips + date/time | ✔ dropdowns + search | ✔ TextField + validation + OTP | N/A | ◐ TextInput primitive with props exists; no form model, no validation, no pickers, no chip/select inputs, no password-toggle composition | Form container component (field registration, submit button wiring, validation rules per field: required/email/min, error text slot), secure-entry toggle, chip-group selector, DatePicker/TimePicker, select/dropdown |
| 8 | **Chat interfaces** | ◐ messaging admin console (table+modals, not chat UX) | ✔ document-based group chat feed in FlatList | ✖ | ✖ | N/A (likely ✔ if AI app) | ✖ No chat/message components | Message-list specialized component (bubbles, sender alignment, timestamps, load-older), composer (input + send), optional realtime subscription; can be built atop FlatList (#4) + data layer (#5) |
| 9 | **Streaming content** (SSE/websockets/token streams) | ✖ (polling only) | ✖ | ✖ | ✖ | N/A (unknown) | ✖ | **Not needed for parity with these 4 apps (0/4 use it).** Defer unless z.ai-mobile (or future AI apps) matters: would need a stream data source + incremental text rendering |
| 10 | **Maps** (MapView, markers, polylines, location) | ✖ | ✖ | ✔ full map stack | ✖ | N/A | ✖ No maps at all | **Specialized component:** expo-compatible `MapView` wrapper (react-native-maps): initial region, markers w/ custom callouts, polyline/circle children, camera animation action, `expo-location` permission + current-location action, URL tile config |
| 11 | **Gestures** (long-press, swipe, drag, pan) | ✔ swipe tabs, dropdowns, haptics | ✔ long-press copy/apply | ✔ PanResponder sheets, marker long-press | ✔ calendar drag-resize ranges | N/A | ✖ Pressables exist (Button) but **no gesture or event wiring at all** | Event system first (onPress/onLongPress → actions), then swipe/pan configs on any node, drag-to-dismiss bottom sheet component; haptics action step |
| 12 | **Animations** (transitions, entering, micro-interactions) | ✔ Reanimated 4 + core Animated + screen transitions | ✔ typewriter, switch scale | ✔ sidebar slide, card carousel, tab-bar height, camera | ✔ FadeIn/FadeInUp entering | N/A | ✖ No animation editor; static styles only | Phased: (1) screen transition options (#1), (2) entering/exiting presets on nodes (FadeIn/SlideInUp etc.), (3) scroll-linked interpolations (sticky header, carousel scale), (4) keyframe/timeline editor. Codegen target: Reanimated |
| 13 | **Custom inputs** (dropdown, OTP, password field, search bar) | ✔ full primitives kit | ✔ FormField + chips | ✔ dropdowns ×2 + search modal | ✔ OTP input + form kit | N/A | ◐ TextInput + Button + Switch primitives only | Ship composite input components: PasswordField (auto toggle icon), SearchBar, Select/Dropdown (opens modal/sheet), OTPInput, ChipGroup, Slider, Checkbox. Most are compositions of existing primitives + events |
| 14 | **State management** (screen/global state, persistence) | ✔ zustand ×4 + Context + AsyncStorage | ✔ Context | ✔ Context ×2 + SQLite + AsyncStorage | ✔ theme Context + AsyncStorage | N/A | ✖ No state model — props are static literals | State panel: screen-local state (useState), app-global store, persisted keys (AsyncStorage), bind state → props (text, source, colors, visibility), setState actions in the event system (#11) |
| 15 | **Keyboard behavior** (avoiding view, insets, tab-bar hide) | ✔ KeyboardAvoidingView + persistTaps | ✖ | ✔ avoiding view + keyboard-aware tab bar | ✔ persistTaps + insets (+ keyboard-controller mandated in skill doc) | N/A | ✖ No keyboard handling config | Screen-level keyboard options: `KeyboardAvoidingView` wrapper (behavior per platform), `keyboardShouldPersistTaps`, auto-hide tab bar toggle, bottom inset padding; later react-native-keyboard-controller integration |
| 16 | **Native functionality** (haptics, clipboard, files, location, webview, sqlite, toast…) | ✔ haptics/clipboard/doc-picker/file-system/sharing/web-browser/nav-bar/svg/pager | ✔ clipboard/toast/datetimepicker | ✔ maps/location/sqlite/webview/toast | ✔ blur/image/haptics/svg/@expo-ui | N/A | ◐ LinearGradient, BlurView, expo-image, Switch, ActivityIndicator supported; **no other native modules** | Toast + DateTimePicker + BottomSheet (highest frequency), then haptics/clipboard action steps, WebView component, document-picker/file actions, expo-location, expo-sqlite data source, share action. Long tail: keep an extensible "native module registry" |

**Additional cross-cutting rows observed in the apps (not in the requested 16, worth tracking):**

| Capability | AN | Cr | TM | KS | Builder |
|---|---|---|---|---|---|
| Dark/light **theme system w/ persistence** | ✔ | ✖ | ✔ | ✔ (token-based) | ✖ missing (no theme/token system) |
| **Modals / bottom sheets** | ✔ primitives dialogs + PortalHost | ✔ RN `Modal` | ✔ RN `Modal` + PanResponder sheets | ✔ @expo-ui + @gorhom sheets | ✖ missing |
| **Toast/snackbar feedback** | ✖ (uses Alert) | ✔ toast-message | ✔ toast-message | ✔ useToast (heroui) | ✖ missing |
| **Custom fonts / splash / status bar** | ✔ 9 fonts | ✔ 9 fonts | ✔ 18 fonts | ✔ 4 fonts | ◐ (app config only? no font manager observed) |
| **Charts** | ✔ custom SVG line chart | ✖ | ✖ | ✖ | ✖ missing |
| **File upload / document picker** | ✔ (table row import) | ◐ declared only | ✖ | ✖ | ✖ missing |
| **SQLite / local DB cache** | ✖ | ✖ | ✔ sync engine | ✖ | ✖ missing |
| **Push notifications** | ✖ | ✔ via cloud function | ✖ | ✖ | ✖ missing |

---

## 3. Gap Classification

| Gap | Classification | Rationale |
|---|---|---|
| Static screens: View/Text/Image/ScrollView/Switch/ActivityIndicator/Divider/LinearGradient/BlurView | **already supported** | Schema-driven inspector covers these exactly |
| Stack/Tabs screen-group structure, headers, native vs custom tab bar | **already supported** | Real expo-router files verified against expo-router@58 |
| Platform variant simulation, canvas editing, undo/redo, codegen | **already supported** | Builder's core strengths |
| Navigation polish (per-screen animations, modal/formSheet presentation, top-tabs, tab-bar composition) | **needs improvement** | The nav model exists; these are additive options on existing structures |
| Forms | **needs improvement** ( TextInput primitive is the seed) | Needs form container, validation, field wiring — composable from existing inputs |
| Custom inputs (PasswordField, Select, SearchBar, OTP, Chips) | **partially supported** | TextInput/Button/Switch primitives exist; composites are missing recipes on top |
| Native functionality breadth | **partially supported** | 5 native-ish components today; Toast/DateTimePicker/BottomSheet/WebView/haptics/clipboard absent |
| Screen-group nesting depth (`Slot`, guards) | **partially supported** | Groups+Stack+Tabs yes; Slot/guards no |
| **Interaction/event wiring (onPress → navigate/submit/toggle)** | **missing** | The single most blocking gap — every app is event-driven |
| **Dynamic lists (FlatList/SectionList)** | **missing** | Used in 3/4 apps; zero list support today |
| **Data binding / API integration** | **missing** | All 4 apps are backend-driven |
| **Authentication flows** | **missing** | 4/4 apps are auth-gated |
| **State management & persistence** | **missing** | 4/4 apps |
| **Theme/token system (dark/light)** | **missing** | 3/4 apps |
| **Reusable components/variants** | **missing** | 4/4 apps |
| **Animation editor** | **missing** | 4/4 apps (Reanimated/Animated/Animatable) |
| **Keyboard handling config** | **missing** | 3/4 apps |
| Maps (MapView/markers/polylines/location) | **needs a specialized custom component** | react-native-maps wrapper + expo-location actions; not expressible with primitives |
| Charts | **needs a specialized custom component** | SVG/victory-native line chart (Appwrite-Native usage) |
| Chat message list + composer | **needs a specialized custom component** | Build atop FlatList + events + data layer; Crimson proves it's documents + list |
| Bottom sheet / DateTimePicker / Toast / WebView | **needs a specialized custom component** | High-frequency shells around native modules |
| OTP input, calendar w/ drag ranges | **needs a specialized custom component** | Composite interactive inputs (Keystone) |
| Appwrite/backend SDK wiring & config | **genuinely requires custom code** | Real backend integration: endpoints, collections, OAuth client setup — needs a code-level integration hook/escape hatch even with a visual data layer |
| OAuth + deep-link email verification/reset flows | **genuinely requires custom code** | TravelMate `verifying.jsx` + Crimson `verifyEmail` — scheme/deep-link config + SDK calls |
| SQLite cloud-sync engine (offset bookkeeping, WAL schema) | **genuinely requires custom code** | TravelMate `lib/dbInsert.js` — algorithmic sync logic |
| Pathfinding / route-graph algorithms | **genuinely requires custom code** | TravelMate `lib/pathfinder.js` (shortest path, top-3 routes, fare calc) — domain logic, never a builder feature |
| Push notifications via cloud functions | **genuinely requires custom code** | Crimson `getUserToken`/`sendNotification` — server-side component |
| Polling/refresh lifecycle, message status polling | **genuinely requires custom code** ( thin action recipes could cover simple cases) | Appwrite-Native `messages.jsx` polling intervals |

---

## 4. Direct Answer

### "Can a user build applications at the level of these projects using the current visual builder?"

**No — not even close to functional parity, though closer on visual/structural parity than it might first appear.**

What a user **can** build today: the complete *visual shell and navigation skeleton* of all four apps — every static screen (login cards, profile cards, dashboards, headers, tab bars, gradients, frosted panels, images, dividers), organized into real Stack/Tabs screen groups that generate working expo-router projects. The builder's verified real-router codegen means the *skeleton runs*.

What breaks immediately, for **every one of the four apps**:

1. **Nothing is interactive.** No `onPress` can be wired — not "navigate to search", not "submit login", not "toggle availability". Appwrite-Native, Crimson, TravelMate and Keystone are 100% event-driven; the builder produces 0% event wiring. A generated app is a stack of dead pixels.
2. **No lists.** 3 of 4 apps render their primary content in FlatLists (donor results, request feeds, tourism carousels, data tables). The builder has no list component at all — content would have to be hand-duplicated Views with static text.
3. **No data.** All four apps live on a backend (Appwrite ×3, axios planned). Every interesting value on every screen (`user?.avatar`, `item.Bloodtype`, message feeds) is dynamic. In the builder, all text/images are literals.
4. **No auth.** All four gate their tabs behind a session and redirect unauthenticated users. The builder can draw a login screen but cannot make it log anyone in or protect a route.
5. **No shared components.** Each app has a `components/` library (30+ primitives in Appwrite-Native; FormField/CustomButton in Crimson/TravelMate; heroui-native in Keystone). In the builder, every screen is a one-off tree — the "level" of these projects is precisely their component reuse, which is unreachable.

**What is NOT actually missing for parity** (contrary to what one might assume): **streaming content** — none of the four apps use SSE/websockets/token streaming (Crimson's "chat" is polled Appwrite documents; Appwrite-Native polls message status). Maps and charts matter to exactly one app each. So the long tail (maps, chat, charts, SQLite, push) is real but narrow; the blocker is the fundamentals: **events, lists, data, auth, components**.

### Prioritized missing-capability list (ordered by real usage frequency across the analyzable apps)

| Priority | Capability | Used by | Count | Why this rank |
|---|---|---|---|---|
| **P0-1** | **Interaction/event wiring** (onPress/onLongPress/onValueChange → navigate / set state / submit / open modal) | AN, Cr, TM, KS — every screen of every app | **4/4** | The #1 blocker; without it nothing else matters. Buttons exist but are inert |
| **P0-2** | **Dynamic lists (FlatList + item templates, horizontal mode, pull-to-refresh)** | AN (DataTable, pickers), Cr (3 feeds), TM (8 lists) | **3/4** (KS pending domain lists) | Primary content surface of 3 apps; no partial workaround exists |
| **P0-3** | **API/data integration + data binding** (fetch → bind to lists/texts/images; loading/error/empty states) | AN, Cr, TM fully; KS planned (axios) | **4/4** | Every dynamic value in every app depends on it |
| **P0-4** | **Authentication flows** (email/password, session, guarded groups, OAuth buttons, verify/reset screens) | AN, Cr, TM, KS | **4/4** | All four apps are auth-gated; blocks the entire app behind login |
| **P0-5** | **Forms** (form model, validation, error text, secure entry, submit lifecycle) | AN, Cr, TM, KS | **4/4** | Login, signup, create-request, registers — all forms |
| **P1-6** | **State management** (screen state, global store, AsyncStorage persistence, state→prop binding) | AN (zustand×4), Cr, TM, KS | **4/4** | Required to make events and data meaningful |
| **P1-7** | **Reusable components + variants** | AN, Cr, TM, KS | **4/4** | Defines the engineering "level" of these projects; also fixes builder ergonomics |
| **P1-8** | **Modals & bottom sheets** (RN Modal, dialog primitives, @gorhom/expo-ui sheets) | AN (dialogs+Portal), Cr (Modal), TM (Modal+sheets), KS (expo-ui sheets) | **4/4** | Ubiquitous container pattern (menus, confirmations, OTP, forms) |
| **P1-9** | **Custom input components** (PasswordField, Select/Dropdown, SearchBar, OTP, ChipGroup, DatePicker) | AN, Cr, TM, KS | **4/4** | Chips select blood type; dropdowns pick districts; OTP verifies email |
| **P1-10** | **Animations** (screen transitions, entering presets, scroll-linked, micro-interactions) | AN (Reanimated 4), Cr (Animated), TM (Animated+Animatable), KS (Reanimated entering) | **4/4** | Polish layer — visible quality gap but apps still function without it |
| **P1-11** | **Navigation improvements** (per-screen animation/presentation, top-tabs, custom tab-bar composition, `Slot`, group guards) | AN, Cr, TM, KS | **4/4** | Structure exists; these are the deltas from builder's Stack/Tabs to these apps' nav |
| **P1-12** | **Theme/token system (dark/light + persistence)** | AN, TM, KS | **3/4** | Cr is fixed-palette; others ship toggles with AsyncStorage |
| **P2-13** | **Keyboard handling config** (KeyboardAvoidingView, persistTaps, tab-bar auto-hide, insets) | AN, TM, KS | **3/4** | Cr ships without it — painful but survivable; still expected quality |
| **P2-14** | **Toast / feedback + haptics + clipboard action steps** | Cr (toast), TM (toast), KS (useToast), AN (haptics+clipboard) | **4/4** (toast 3, haptics 2, clipboard 2) | Small native-module actions, high polish value, cheap to add |
| **P3-15** | **Chat/message list component** (bubbles, composer, load-older) | Cr (group chat), AN (messaging admin ≈ table UI) | **1.5/4** | Specialized; composable from lists+events+data once P0 lands |
| **P3-16** | **Maps component** (MapView, markers, polylines, location permission) | TM only | **1/4** | Specialized custom component; make it a plugin, not core |
| **P3-17** | **Charts component** (SVG line chart) | AN only | **1/4** | Specialized |
| **P3-18** | **Native long tail** (WebView, document-picker/file upload, sharing, sqlite data source, push) | TM (webview, sqlite), AN (doc-picker, sharing), Cr (push via functions) | **1/4 each** | Plugin/registry architecture beats one-off components |
| **P4** | **Streaming content** (SSE/WS/token streams) | none | **0/4** | Not needed for parity with these apps; revisit if z.ai-mobile or AI-app templates become targets |

### Bottom line
The builder's visual canvas + real expo-router codegen is genuinely ahead on *layout and navigation structure* — but it currently tops out at "interactive mockup". The four reference apps define a clear ladder: **events → lists → data → auth → components** (P0–P1, used in 3–4 of 4 apps) is what separates a mockup from an app at this level. Everything else (maps, chat, charts, sqlite, push, streaming) is specialized, used by ≤1.5 apps, and best handled as a plugin/escape-hatch layer rather than core builder features.
