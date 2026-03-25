import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { app } from 'electron';
import type { AppState } from '../types';

const FILENAME = 'session-v1.json';

type PersistedSessionV1 = {
  v: 1;
  baseUrl: string;
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
};

function storagePath(): string {
  return join(app.getPath('userData'), FILENAME);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Read saved server URL + auth. Call only after `app.whenReady()`. */
export function loadPersistedSession(): Partial<Pick<AppState, 'auth' | 'server'>> {
  try {
    const p = storagePath();
    if (!existsSync(p)) return {};
    const raw = JSON.parse(readFileSync(p, 'utf8')) as unknown;
    if (!isRecord(raw) || raw.v !== 1) return {};
    const baseUrl = typeof raw.baseUrl === 'string' ? raw.baseUrl.trim() : '';
    const token = typeof raw.token === 'string' && raw.token.length > 0 ? raw.token : null;
    const username = typeof raw.username === 'string' && raw.username.length > 0 ? raw.username : null;
    const wantsAuth = raw.isAuthenticated === true;
    const authValid =
      baseUrl.length > 0 && wantsAuth && token !== null && username !== null;
    const out: Partial<Pick<AppState, 'auth' | 'server'>> = {};
    if (baseUrl) out.server = { baseUrl };
    if (authValid) {
      out.auth = { token, username, isAuthenticated: true };
    } else if (baseUrl) {
      out.auth = { token: null, username: null, isAuthenticated: false };
    }
    return out;
  } catch {
    return {};
  }
}

/** Persist last server URL and, when logged in, bearer token. Call only after `app.whenReady()`. */
export function persistSessionSnapshot(state: AppState): void {
  try {
    const p = storagePath();
    mkdirSync(dirname(p), { recursive: true });
    const authed = Boolean(state.auth.isAuthenticated && state.auth.token);
    const data: PersistedSessionV1 = {
      v: 1,
      baseUrl: (state.server.baseUrl ?? '').trim(),
      token: authed ? state.auth.token : null,
      username: authed ? state.auth.username : null,
      isAuthenticated: authed,
    };
    writeFileSync(p, JSON.stringify(data), 'utf8');
  } catch (e) {
    console.error('[Cephalopod] persistSessionSnapshot failed', e);
  }
}
