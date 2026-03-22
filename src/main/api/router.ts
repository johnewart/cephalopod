import { router, publicProcedure } from './trpc';
import { z } from 'zod';
import { AuthService, EventsService, FezService, OpenAPI, PhotostreamService } from 'twitarr-ts';
import { store } from '../store';

/** Configure OpenAPI from store state before API calls */
function configureOpenAPI(baseUrl: string, token?: string | null) {
  OpenAPI.BASE = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/v3` : '';
  OpenAPI.TOKEN = token ?? undefined;
}

export const appRouter = router({
  // ---- Auth ----
  login: publicProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        username: z.string().min(1),
        password: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      console.log('[Cephalopod] login called', {
        baseUrl: input.baseUrl,
        username: input.username,
      });
      try {
        configureOpenAPI(input.baseUrl);
        OpenAPI.USERNAME = input.username;
        OpenAPI.PASSWORD = input.password;

        const apiBase = OpenAPI.BASE || '(not set)';
        console.log('[Cephalopod] authLogin request', {
          OpenAPI_BASE: apiBase,
          authEndpoint: `${apiBase}/auth/login`,
        });

        const result = await AuthService.authLogin();
        console.log('[Cephalopod] authLogin succeeded', { token: result.token ? '[redacted]' : undefined });

        OpenAPI.USERNAME = undefined;
        OpenAPI.PASSWORD = undefined;
        OpenAPI.TOKEN = result.token;

        store.setState((s) => ({
          ...s,
          server: { baseUrl: input.baseUrl },
          auth: {
            token: result.token,
            username: input.username,
            isAuthenticated: true,
          },
        }));

        return { token: result.token, username: input.username };
      } catch (err) {
        const apiErr = err as { url?: string; status?: number; statusText?: string; body?: unknown; request?: unknown };
        console.error('[Cephalopod] login failed', {
          name: (err as Error).name,
          message: (err as Error).message,
          stack: (err as Error).stack,
          cause: (err as Error).cause,
          ...(typeof apiErr?.url !== 'undefined' && {
            apiUrl: apiErr.url,
            apiStatus: apiErr.status,
            apiStatusText: apiErr.statusText,
            apiBody: apiErr.body,
            apiRequest: apiErr.request,
          }),
        });
        throw err;
      }
    }),

  logout: publicProcedure.mutation(async () => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (baseUrl && token) {
      configureOpenAPI(baseUrl, token);
      await AuthService.authLogout();
    }
    store.setState((s) => ({
      ...s,
      auth: {
        token: null,
        username: null,
        isAuthenticated: false,
      },
    }));
    return { ok: true };
  }),

  setServerConfig: publicProcedure
    .input(z.object({ baseUrl: z.string() }))
    .mutation(({ input }) => {
      store.setState((s) => ({
        ...s,
        server: { baseUrl: input.baseUrl },
      }));
      return { ok: true };
    }),

  // ---- Seamail (Fez) ----
  fezJoined: publicProcedure.query(async () => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (!baseUrl || !token) throw new Error('Not authenticated');
    configureOpenAPI(baseUrl, token);
    const result = await FezService.fezJoined();
    return result as unknown;
  }),

  fezGet: publicProcedure
    .input(z.object({ fezId: z.string() }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await FezService.fezGet(input.fezId);
      return result as unknown;
    }),

  fezPostAdd: publicProcedure
    .input(z.object({ fezId: z.string(), text: z.string() }))
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await FezService.fezPostAdd(input.fezId, {
        text: input.text,
        images: [],
        postAsModerator: false,
        postAsTwitarrTeam: false,
      });
      return result as unknown;
    }),

  // ---- Photostream ----
  photostreamList: publicProcedure
    .input(
      z
        .object({
          start: z.number().optional(),
          limit: z.number().optional(),
          eventId: z.string().optional(),
          locationName: z.string().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await PhotostreamService.photostreamList(
        input?.start,
        input?.limit,
        input?.eventId,
        input?.locationName
      );
      return result as unknown;
    }),

  // ---- Events (schedule) ----
  eventsList: publicProcedure
    .input(
      z
        .object({
          cruiseday: z.number().optional(),
          day: z.string().optional(),
          date: z.string().optional(),
          time: z.string().optional(),
          type: z.enum(['official', 'shadow']).optional(),
          search: z.string().optional(),
          location: z.string().optional(),
          following: z.boolean().optional(),
          dayplanner: z.boolean().optional(),
          needsPhotographer: z.boolean().optional(),
          hasPhotographer: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await EventsService.eventsList(
        input?.cruiseday,
        input?.day,
        input?.date,
        input?.time,
        input?.type,
        input?.search,
        input?.location,
        input?.following,
        input?.dayplanner,
        input?.needsPhotographer,
        input?.hasPhotographer
      );
      return result as unknown;
    }),
});

export type AppRouter = typeof appRouter;
