/// <reference types="vite/client" />

interface Window {
  zubridge?: unknown;
  cephalopod?: {
    platform: NodeJS.Platform;
    hiddenInsetTitleBar?: boolean;
    titleBarOverlay?: boolean;
    setDockUnreadCount?: (count: number) => void;
  };
}
