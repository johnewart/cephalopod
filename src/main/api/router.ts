import { router, publicProcedure } from './trpc';
import { z } from 'zod';
import { AuthService, EventsService, FezService, ForumService, OpenAPI, PhotostreamService } from 'twitarr-ts';
import { store } from '../store';

/** Configure OpenAPI from store state before API calls */
function configureOpenAPI(baseUrl: string, token?: string | null) {
  OpenAPI.BASE = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/v3` : '';
  OpenAPI.TOKEN = token ?? undefined;
}

/** Swiftarr UUID path params are often compared lowercase; URLs may carry uppercase from JSON. */
function normalizeSwiftarrUuid(id: string): string {
  const t = id.trim();
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)
  ) {
    return t.toLowerCase();
  }
  return t;
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
      // Swiftarr paginates posts: without ?start= it uses readCount to pick a window, so after many
      // messages the last page can be a single post (e.g. right after sending). Load from the start.
      const fezId = normalizeSwiftarrUuid(input.fezId);
      const root = (OpenAPI.BASE || '').replace(/\/$/, '');
      const url = `${root}/fez/${encodeURIComponent(fezId)}?start=0&limit=200`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        let detail = '';
        try {
          detail = (await res.text()).slice(0, 500);
        } catch {
          detail = res.statusText;
        }
        throw new Error(`Seamail thread failed to load (${res.status}): ${detail}`);
      }
      return (await res.json()) as unknown;
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

  // ---- Forums ----
  forumCategories: publicProcedure.query(async () => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (!baseUrl || !token) throw new Error('Not authenticated');
    configureOpenAPI(baseUrl, token);
    const result = await ForumService.forumCategories();
    return result as unknown;
  }),

  forumCategoryForums: publicProcedure
    .input(z.object({ categoryId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await ForumService.forumCategoryForums(normalizeSwiftarrUuid(input.categoryId));
      return result as unknown;
    }),

  forumGet: publicProcedure
    .input(z.object({ forumId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await ForumService.forumGet(normalizeSwiftarrUuid(input.forumId));
      return result as unknown;
    }),

  forumPostGet: publicProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await ForumService.forumPostGet(normalizeSwiftarrUuid(input.postId));
      return result as unknown;
    }),
});

export type AppRouter = typeof appRouter;
