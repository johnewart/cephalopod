import { existsSync } from 'fs';
import { release as osRelease } from 'node:os';
import { app, BrowserWindow, nativeImage } from 'electron';
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

/** `static/` is copied to `out/renderer/` on build; in dev, read from project `static/`. */
function resolveAppIconPath(): string | undefined {
  const fromBuild = join(__dirname, '../renderer/icon.png');
  if (existsSync(fromBuild)) return fromBuild;
  const fromStatic = join(process.cwd(), 'static', 'icon.png');
  if (existsSync(fromStatic)) return fromStatic;
  return undefined;
}

const appIconPath = resolveAppIconPath();
const appIconImage = (() => {
  if (!appIconPath) return undefined;
  const img = nativeImage.createFromPath(appIconPath);
  return img.isEmpty() ? undefined : img;
})();

let mainWindow: BrowserWindow | null = null;

const WINDOW_BG = '#16171C';

function isWindows11OrNewerBuild(): boolean {
  if (process.platform !== 'win32') return false;
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(osRelease());
  if (!m) return false;
  const build = parseInt(m[3], 10);
  return build >= 22000;
}

function getWindowChromeOptions(): {
  browserOptions: Electron.BrowserWindowConstructorOptions;
  /** Passed to renderer via `webPreferences.additionalArguments` (read in preload). */
  rendererArgvFlags: string[];
} {
  const rendererArgvFlags: string[] = [];

  if (process.platform === 'darwin') {
    rendererArgvFlags.push('--ceph-hidden-inset');
    return {
      rendererArgvFlags,
      browserOptions: {
        backgroundColor: WINDOW_BG,
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 16, y: 14 },
      },
    };
  }

  if (process.platform === 'win32' && isWindows11OrNewerBuild()) {
    rendererArgvFlags.push('--ceph-titlebar-overlay');
    return {
      rendererArgvFlags,
      browserOptions: {
        backgroundColor: WINDOW_BG,
        frame: false,
        titleBarOverlay: {
          color: WINDOW_BG,
          symbolColor: '#EFECE2',
          height: 32,
        },
      },
    };
  }

  return {
    rendererArgvFlags,
    browserOptions: {
      backgroundColor: WINDOW_BG,
    },
  };
}

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
  const { browserOptions, rendererArgvFlags } = getWindowChromeOptions();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    ...(appIconImage ? { icon: appIconImage } : {}),
    ...browserOptions,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: rendererArgvFlags,
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

app.whenReady().then(() => {
  if (process.platform === 'darwin' && appIconImage) app.dock.setIcon(appIconImage);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
