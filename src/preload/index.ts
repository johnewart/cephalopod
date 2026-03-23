import { contextBridge } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

const { handlers } = preloadBridge();
contextBridge.exposeInMainWorld('zubridge', handlers);

/** Window chrome flags are decided in the main process (see `getWindowChromeFlags()`). */
contextBridge.exposeInMainWorld('cephalopod', {
  platform: process.platform,
  hiddenInsetTitleBar: process.argv.includes('--ceph-hidden-inset'),
  titleBarOverlay: process.argv.includes('--ceph-titlebar-overlay'),
});
