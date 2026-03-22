import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import cors from 'cors';
import { createZustandBridge } from '@zubridge/electron/main';
import { appRouter } from './api/router';
import { store } from './store';

/** Port for tRPC HTTP server (avoid 5173-5179 used by Vite) */
const TRPC_PORT = 3847;

console.log('[Cephalopod] main process starting');

// Fix for Electron 28+ rendering issues (blank white page)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let mainWindow: BrowserWindow | null = null;

const trpcServer = createHTTPServer({
  middleware: cors(),
  router: appRouter,
  createContext: () => ({}),
  basePath: '/trpc/',
  onError: ({ path, error, type, input }) => {
    console.error('[Cephalopod] tRPC onError', {
      path,
      type,
      input: type === 'mutation' ? '(redacted)' : input,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    });
  },
});
trpcServer.listen(TRPC_PORT);
console.log('[Cephalopod] tRPC HTTP server listening on port', TRPC_PORT);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  const bridge = createZustandBridge(store);
  bridge.subscribe([mainWindow]);
  app.on('quit', () => bridge.subscribe([mainWindow]).unsubscribe());
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
