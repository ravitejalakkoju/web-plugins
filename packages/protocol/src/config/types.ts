/**
 * The config contract every widget shares.
 *
 * Core keys (`chrome`, `src`, `visibility`, `colors`, `placement`, `launcher`,
 * `frame`, `analytics`, `theme`) are owned by this package and understood by the
 * runtime. `view` and `meta` are opaque here: they are validated by the widget's
 * own schema and handed to the iframe untouched.
 */

/** How the runtime presents the widget on the host page. */
export type ChromeMode = 'fab' | 'modal' | 'panel' | 'none';

export const CHROME_MODES: readonly ChromeMode[] = ['fab', 'modal', 'panel', 'none'];

export type Align = 'left' | 'right' | 'center';

/** Operators supported by page targeting rules. */
export type PageRuleOperator = 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex';

export const PAGE_RULE_OPERATORS: readonly PageRuleOperator[] = [
  'equals',
  'contains',
  'starts_with',
  'ends_with',
  'regex',
];

export interface PageRule {
  operator: PageRuleOperator;
  value: string;
}

export interface DeviceToggles {
  desktop: boolean;
  mobile: boolean;
}

export interface VisibilityConfig {
  device: DeviceToggles;
  pages: {
    specific: boolean;
    values?: PageRule[];
  };
}

export interface ColorsConfig {
  primaryColor: string;
  primaryTextColor?: string | null;
  secondaryTextColor?: string | null;
  primaryBackgroundColor?: string | null;
}

/**
 * `side` is the horizontal inset applied to whichever edge `align` selects, so
 * one value covers both left and right placement.
 */
export interface PlacementValues {
  side: number;
  bottom?: number;
}

export interface PlacementSide {
  align: Align;
  values?: PlacementValues;
}

export interface PlacementConfig {
  desktop: PlacementSide;
  mobile: PlacementSide;
}

export type LauncherActionType = 'open' | 'open-url';

export interface LauncherAction {
  type: LauncherActionType;
  /** Required for `open-url`. Supports `{{...}}` placeholders resolved by the widget. */
  url?: string | null;
  target?: '_blank' | '_self';
}

export type CalloutMode = 'slide_in' | 'expand' | 'typing_expand';

export interface LauncherCallout {
  text?: string | null;
  mode?: CalloutMode | null;
  show?: DeviceToggles;
}

export interface LauncherIcon {
  /** Inline SVG markup. Rejected by the schema if it contains a script tag. */
  svg?: string | null;
  /** Image URL, used when `svg` is absent. */
  url?: string | null;
}

export interface LauncherConfig {
  label?: string | null;
  tooltip?: string | null;
  icon?: LauncherIcon;
  callout?: LauncherCallout;
  /** Open the widget without a visitor click. */
  autoOpen?: boolean;
  /** Seconds to wait before `autoOpen` fires. */
  timer?: number;
  action?: LauncherAction;
  [key: string]: unknown;
}

export interface FrameConfig {
  height?: number;
  width?: number;
  position?: 'absolute' | 'relative';
}

export interface AnalyticsConfig {
  gtagId?: string | null;
}

export interface ThemeConfig {
  fontFamily?: string | null;
  /** Stylesheet injected into the shadow root, e.g. a Google Fonts href. */
  fontUrl?: string | null;
}

export interface WidgetConfig {
  /** Published version, stamped by the server. */
  version?: number;
  chrome: ChromeMode;
  /** Iframe URL. Null or absent means host-only chrome with no iframe. */
  src?: string | null;
  frame?: FrameConfig;
  visibility: VisibilityConfig;
  colors: ColorsConfig;
  placement: PlacementConfig;
  launcher?: LauncherConfig;
  analytics?: AnalyticsConfig;
  theme?: ThemeConfig;
  /** Template-defined. Passed through to the iframe. */
  view?: Record<string, unknown>;
  /** Template-defined. Passed through to the iframe. */
  meta?: Record<string, unknown>;
}
