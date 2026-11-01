/**
 * Ambient type declarations for `react-native-web@0.21.4`.
 *
 * The package ships only .flow types (no .d.ts) and `@types/react-native-web`
 * is NOT installed — without this file every import would be implicit `any`.
 * The prop surfaces below were written against the actual flow types in
 * node_modules/react-native-web/dist/exports/* and cover the props the
 * ExpoForge preview + canvas use. Extend (don't narrow) when new props are
 * needed — this declaration is ambient and project-wide.
 */
declare module 'react-native-web' {
  import type { ComponentType, ReactNode } from 'react'

  /* Styles — RNW accepts plain objects (ExpoForge uses inline objects only,
   * never StyleSheet). Values may be nested (transform steps, shadow offsets);
   * `unknown` mirrors the project model (ProjectNode.style is
   * Record<string, unknown>) — RNW itself validates/normalizes at runtime. */
  export interface StyleRecord {
    [key: string]: unknown
  }
  export type StyleProp = StyleRecord | StyleRecord[] | null | undefined | false

  /* View — maps to a div; testID renders as data-testid on the DOM node. */
  export interface ViewProps {
    style?: StyleProp
    testID?: string
    children?: ReactNode
    pointerEvents?: 'auto' | 'box-none' | 'box-only' | 'none'
    accessible?: boolean
    accessibilityRole?: string
    accessibilityLabel?: string
    accessibilityElementsHidden?: boolean
    collapsable?: boolean
    onLayout?: (event: {
      nativeEvent: { layout: { x: number; y: number; width: number; height: number } }
    }) => void
  }
  export const View: ComponentType<ViewProps>

  /* Text — children must be plain strings / nested Text (RN rules). */
  export interface TextProps {
    style?: StyleProp
    testID?: string
    children?: ReactNode
    numberOfLines?: number
    ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip'
    selectable?: boolean
    adjustsFontSizeToFit?: boolean
    allowFontScaling?: boolean
    accessibilityRole?: string
    accessibilityLabel?: string
    onPress?: (event: unknown) => void
  }
  export const Text: ComponentType<TextProps>

  /* TextInput — maps to input/textarea; RNW attaches its own DOM onChange, so
   * a controlled `value` never trips React's no-onChange warning. */
  export interface TextInputProps {
    style?: StyleProp
    testID?: string
    value?: string
    defaultValue?: string
    placeholder?: string
    placeholderTextColor?: string
    keyboardType?: string
    autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
    autoCorrect?: boolean
    editable?: boolean
    maxLength?: number
    multiline?: boolean
    secureTextEntry?: boolean
    returnKeyType?: string
    textAlignVertical?: string
    onChangeText?: (text: string) => void
    onFocus?: (event: unknown) => void
    onBlur?: (event: unknown) => void
    onSubmitEditing?: (event: { nativeEvent: { text: string } }) => void
  }
  export const TextInput: ComponentType<TextInputProps>

  /* Pressable — style may be a function of { pressed }. */
  export interface PressableProps {
    style?: StyleProp | ((state: { pressed: boolean }) => StyleProp)
    testID?: string
    children?: ReactNode | ((state: { pressed: boolean }) => ReactNode)
    disabled?: boolean
    hitSlop?: number | { top?: number; left?: number; bottom?: number; right?: number }
    onPress?: (event: unknown) => void
    onLongPress?: (event: unknown) => void
    onPressIn?: (event: unknown) => void
    onPressOut?: (event: unknown) => void
    accessibilityRole?: string
    accessibilityLabel?: string
    accessibilityState?: { disabled?: boolean; [key: string]: unknown }
  }
  export const Pressable: ComponentType<PressableProps>

  /* ScrollView — native DOM scrolling. */
  export interface ScrollViewProps {
    style?: StyleProp
    testID?: string
    children?: ReactNode
    horizontal?: boolean
    scrollEnabled?: boolean
    showsVerticalScrollIndicator?: boolean
    showsHorizontalScrollIndicator?: boolean
    contentContainerStyle?: StyleProp
    keyboardShouldPersistTaps?: 'never' | 'always' | 'handled'
    onScroll?: (event: unknown) => void
  }
  export const ScrollView: ComponentType<ScrollViewProps>

  /* Image — `source={{ uri }}`; `tintColor` works as a STYLE key (RNW turns
   * it into a CSS filter). Default resizeMode is 'cover'. */
  export interface ImageSourceProp {
    uri: string
    [key: string]: unknown
  }
  export interface ImageProps {
    style?: StyleProp
    testID?: string
    source?: ImageSourceProp | number
    defaultSource?: ImageSourceProp | number
    resizeMode?: 'cover' | 'contain' | 'stretch' | 'center' | 'none' | 'repeat'
    blurRadius?: number
    accessibilityLabel?: string
    /** Web-canonical label — RNW renders it as the DOM aria-label/alt. */
    'aria-label'?: string
    onLoad?: (event: unknown) => void
    onError?: (event: unknown) => void
  }
  export const Image: ComponentType<ImageProps>

  /* Switch — RNW renders a checkbox-backed toggle; `trackColor` accepts the
   * RN object shape { true, false }. No ios_backgroundColor on web. */
  export interface SwitchProps {
    style?: StyleProp
    testID?: string
    value?: boolean
    disabled?: boolean
    thumbColor?: string
    trackColor?: string | { false?: string; true?: string }
    onValueChange?: (value: boolean) => void
    accessibilityLabel?: string
  }
  export const Switch: ComponentType<SwitchProps>

  /* ActivityIndicator — CSS spinner; size also accepts numbers on web. */
  export interface ActivityIndicatorProps {
    style?: StyleProp
    testID?: string
    animating?: boolean
    size?: 'small' | 'large' | number
    color?: string
    hidesWhenStopped?: boolean
  }
  export const ActivityIndicator: ComponentType<ActivityIndicatorProps>
}
