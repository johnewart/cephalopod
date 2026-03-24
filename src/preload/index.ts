import { contextBridge, ipcRenderer } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

const { handlers } = preloadBridge();
contextBridge.exposeInMainWorld('zubridge', handlers);

/** Window chrome flags are decided in the main process (see `getWindowChromeFlags()`). */
contextBridge.exposeInMainWorld('cephalopod', {
  platform: process.platform,
  hiddenInsetTitleBar: process.argv.includes('--ceph-hidden-inset'),
  titleBarOverlay: process.argv.includes('--ceph-titlebar-overlay'),
  /** macOS dock badge; no-op on other platforms (handled in main). */
  setDockUnreadCount: (count: number) => {
    void ipcRenderer.invoke('ceph:set-dock-badge', count);
  },
});
