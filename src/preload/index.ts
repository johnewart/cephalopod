import { contextBridge } from 'electron';
import { preloadBridge } from '@zubridge/electron/preload';

const { handlers } = preloadBridge();
contextBridge.exposeInMainWorld('zubridge', handlers);
