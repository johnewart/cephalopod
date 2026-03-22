import { createUseStore } from '@zubridge/electron';
import type { AppState } from '../../types';

export const useStore = createUseStore<AppState>();
