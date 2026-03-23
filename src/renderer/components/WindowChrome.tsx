import type { CSSProperties } from 'react';

export type CephalopodChrome = {
  platform: string;
  hiddenInsetTitleBar: boolean;
  titleBarOverlay: boolean;
};

export function getCephalopodChrome(): CephalopodChrome {
  const c = typeof window !== 'undefined' ? window.cephalopod : undefined;
  return {
    platform: c?.platform ?? 'web',
    hiddenInsetTitleBar: Boolean(c?.hiddenInsetTitleBar),
    titleBarOverlay: Boolean(c?.titleBarOverlay),
  };
}

/** Must match `Layout.Sider` width in `AppShell`. */
export const APP_SIDER_WIDTH = 240;

const TRAFFIC_LIGHT_GAP = 78;

const drag: CSSProperties = { WebkitAppRegion: 'drag' };
const noDrag: CSSProperties = { WebkitAppRegion: 'no-drag' };

/** macOS `hiddenInset`: align strip with shell — sider tone left, content tone right; draggable except traffic lights. */
export function WindowDragStrip() {
  if (!getCephalopodChrome().hiddenInsetTitleBar) return null;

  return (
    <div
      style={{
        display: 'flex',
        height: 36,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: APP_SIDER_WIDTH,
          flexShrink: 0,
          display: 'flex',
          background: '#2C3031',
        }}
      >
        <div style={{ width: TRAFFIC_LIGHT_GAP, flexShrink: 0, ...noDrag }} aria-hidden />
        <div style={{ flex: 1, minWidth: 0, ...drag }} />
      </div>
      <div style={{ flex: 1, minWidth: 0, background: '#1B1D23', ...drag }} />
    </div>
  );
}
