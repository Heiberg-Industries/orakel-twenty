import type { CSSProperties } from 'react';

// Inline styles only: a front component's CSS is injected into Twenty's page unscoped. Colours and
// sizes come from Twenty's theme variables, so the widget follows light and dark mode.

const token = (name: string, fallback: string) => `var(--t-${name}, ${fallback})`;

export const colors = {
  primary: token('font-color-primary', '#333'),
  secondary: token('font-color-secondary', '#666'),
  tertiary: token('font-color-tertiary', '#999'),
  danger: token('font-color-danger', '#d33'),
  border: token('border-color-light', '#eee'),
  backgroundSecondary: token('background-secondary', '#fafafa'),
};

export const fontSize = {
  sm: token('font-size-sm', '12px'),
  md: token('font-size-md', '13px'),
};

export const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 12,
    width: '100%',
    boxSizing: 'border-box',
    color: colors.primary,
    fontSize: fontSize.md,
    minWidth: 0,
  },
  tabBar: {
    display: 'flex',
    gap: 4,
    borderBottom: `1px solid ${colors.border}`,
  },
  tab: (active: boolean): CSSProperties => ({
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? colors.primary : 'transparent'}`,
    color: active ? colors.primary : colors.secondary,
    cursor: 'pointer',
    font: 'inherit',
    fontWeight: active ? 600 : 400,
    padding: '6px 8px',
    marginBottom: -1,
  }),
  // Label / value rows that wrap to one column when the widget is narrow.
  list: {
    display: 'grid',
    gridTemplateColumns: 'minmax(96px, max-content) minmax(0, 1fr)',
    columnGap: 12,
    rowGap: 6,
    margin: 0,
  },
  label: { color: colors.secondary, margin: 0 },
  value: { margin: 0, minWidth: 0, overflowWrap: 'anywhere' },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  muted: { color: colors.secondary, margin: 0 },
  heading: { fontWeight: 600, margin: 0 },
  error: { color: colors.danger, margin: 0 },
  link: { color: 'inherit', textDecoration: 'underline' },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  suggestion: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '6px 8px',
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    minWidth: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontVariantNumeric: 'tabular-nums',
    tableLayout: 'fixed',
  },
  th: {
    textAlign: 'right',
    color: colors.secondary,
    fontWeight: 400,
    padding: '4px 4px',
    borderBottom: `1px solid ${colors.border}`,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  td: { textAlign: 'right', padding: '4px 4px', whiteSpace: 'nowrap' },
} satisfies Record<string, CSSProperties | ((...args: never[]) => CSSProperties)>;
