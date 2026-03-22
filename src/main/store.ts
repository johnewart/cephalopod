import { createStore } from 'zustand/vanilla';
import type { AppState, AuthState, ServerConfig } from '../types';

const initialAuth: AuthState = {
  token: null,
  username: null,
  isAuthenticated: false,
};

const initialServer: ServerConfig = {
  baseUrl: '',
};

const initialState: AppState = {
  auth: initialAuth,
  server: initialServer,
};

export const store = createStore<AppState>()(() => initialState);
