/** Shared app state - synced via zubridge between main and renderer */
export interface AppState {
  auth: AuthState;
  server: ServerConfig;
}

export interface AuthState {
  token: string | null;
  username: string | null;
  isAuthenticated: boolean;
}

export interface ServerConfig {
  baseUrl: string;
}
