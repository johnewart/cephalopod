import { router, publicProcedure } from './trpc';
import { z } from 'zod';
import {
  AuthService,
  BoardgamesService,
  EventsService,
  FezService,
  ForumService,
  HuntsService,
  OpenAPI,
  PhotostreamService,
  UsersService,
} from 'twitarr-ts';
import { store } from '../store';
import { getForumViewedIdSet, markForumPostsViewed, mergeForumPayloadReadState } from '../forumViewedPosts';
import { normalizeTwitarrUuid } from '../normalizeTwitarrUuid';

/** Configure OpenAPI from store state before API calls */
function configureOpenAPI(baseUrl: string, token?: string | null) {
  OpenAPI.BASE = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/v3` : '';
  OpenAPI.TOKEN = token ?? undefined;
}

function twitarrApiRoot(): string {
  const root = (OpenAPI.BASE || '').replace(/\/$/, '');
  if (!root) throw new Error('Server URL not configured');
  return root;
}

async function twitarrFetchJson<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { baseUrl } = store.getState().server;
  const { token } = store.getState().auth;
  if (!baseUrl || !token) throw new Error('Not authenticated');
  configureOpenAPI(baseUrl, token);
  const url = `${twitarrApiRoot()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 800);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`Request failed (${res.status}): ${detail}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON (${method} ${path}): ${text.slice(0, 300)}`);
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      /* keep outer string */
    }
  }
  return parsed as T;
}

/**
 * Twitarr `POST /hunts/puzzles/:id/callin` decodes the request body as plain text (not JSON).
 * Response is JSON (`HuntPuzzleCallInResultData`).
 */
async function twitarrPostPlaintextForJson<T>(path: string, plaintextBody: string): Promise<T> {
  const { baseUrl } = store.getState().server;
  const { token } = store.getState().auth;
  if (!baseUrl || !token) throw new Error('Not authenticated');
  configureOpenAPI(baseUrl, token);
  const url = `${twitarrApiRoot()}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'text/plain; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: plaintextBody,
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 800);
    } catch {
      detail = res.statusText;
    }
    throw new Error(`Request failed (${res.status}): ${detail}`);
  }
  const text = await res.text();
  if (!text.trim()) return undefined as T;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Server returned non-JSON (POST ${path}): ${text.slice(0, 300)}`);
  }
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      /* keep outer string */
    }
  }
  return parsed as T;
}

/** Parse fez id from `POST /fez/create` JSON (shape varies by server). */
function pickCreatedFezId(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object') return undefined;
  const o = data as Record<string, unknown>;
  for (const k of ['fezID', 'id', 'fezId']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const fez = o.fez;
  if (fez && typeof fez === 'object') {
    const f = fez as Record<string, unknown>;
    for (const k of ['fezID', 'id', 'fezId']) {
      const v = f[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return undefined;
}

/**
 * Twitarr `POST /api/v3/user/profile` expects `UserProfileUploadData` with every key present;
 * empty strings clear optional text fields. See `UserController.profileUpdateHandler`.
 */
const userProfileUpdateBodySchema = z.object({
  displayName: z.string(),
  realName: z.string(),
  preferredPronoun: z.string(),
  homeLocation: z.string(),
  roomNumber: z.string(),
  email: z.string(),
  message: z.string(),
  about: z.string(),
  discordUsername: z.string(),
  dinnerTeam: z.enum(['red', 'gold', 'sro']).nullable().optional(),
});

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

  /** `GET /api/v3/user/profile` → `ProfilePublicData` */
  userProfileGet: publicProcedure.query(async () => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (!baseUrl || !token) throw new Error('Not authenticated');
    configureOpenAPI(baseUrl, token);
    return twitarrFetchJson<unknown>('GET', '/user/profile');
  }),

  /** `POST /api/v3/user/profile` with `UserProfileUploadData` */
  userProfileUpdate: publicProcedure.input(userProfileUpdateBodySchema).mutation(async ({ input }) => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (!baseUrl || !token) throw new Error('Not authenticated');
    configureOpenAPI(baseUrl, token);
    const body = {
      header: null,
      displayName: input.displayName,
      realName: input.realName,
      preferredPronoun: input.preferredPronoun,
      homeLocation: input.homeLocation,
      roomNumber: input.roomNumber,
      email: input.email,
      message: input.message,
      about: input.about,
      discordUsername: input.discordUsername,
      dinnerTeam: input.dinnerTeam ?? null,
    };
    return twitarrFetchJson<unknown>('POST', '/user/profile', body);
  }),

  /** `POST /api/v3/user/password` — `UserPasswordData` */
  userPasswordChange: publicProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6).max(50),
      })
    )
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      await twitarrFetchJson<unknown>('POST', '/user/password', {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });
      return { ok: true };
    }),

  /** `POST /api/v3/user/username` — `UserUsernameData` */
  userUsernameChange: publicProcedure.input(z.object({ username: z.string().min(1) })).mutation(async ({ input }) => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (!baseUrl || !token) throw new Error('Not authenticated');
    configureOpenAPI(baseUrl, token);
    await twitarrFetchJson<unknown>('POST', '/user/username', {
      username: input.username.trim(),
    });
    store.setState((s) => ({
      ...s,
      auth: {
        ...s.auth,
        username: input.username.trim(),
      },
    }));
    return { ok: true };
  }),

  /**
   * `POST /api/v3/user/image` — `ImageUploadData` (`filename` optional, `image` = raw base64 for Swift `Data`).
   * Returns `UserHeader` JSON from the server.
   */
  userImageUpload: publicProcedure
    .input(
      z.object({
        /** Raw base64 (no `data:...;base64,` prefix) or a full data URL — we strip the prefix. */
        imageBase64: z.string().min(1).max(14_000_000),
      })
    )
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const trimmed = input.imageBase64.trim();
      const dataUrl = /^data:[^;]+;base64,(.+)$/is.exec(trimmed);
      const b64 = (dataUrl ? dataUrl[1] : trimmed).replace(/\s/g, '');
      if (!b64.length) throw new Error('Empty image data');
      return twitarrFetchJson<unknown>('POST', '/user/image', {
        filename: null,
        image: b64,
      });
    }),

  /** `DELETE /api/v3/user/image` — remove profile photo (revert to default / identicon). */
  userImageRemove: publicProcedure.mutation(async () => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (!baseUrl || !token) throw new Error('Not authenticated');
    configureOpenAPI(baseUrl, token);
    await twitarrFetchJson<unknown>('DELETE', '/user/image');
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

  fezOpen: publicProcedure
    .input(
      z.object({
        type: z.array(z.string()).optional(),
        cruiseday: z.number().optional(),
        start: z.number().optional(),
        limit: z.number().optional(),
        hidePast: z.boolean().optional(),
      })
    )
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await FezService.fezOpen(
        input.type,
        input.cruiseday,
        input.start,
        input.limit,
        input.hidePast
      );
      return result as unknown;
    }),

  fezGet: publicProcedure
    .input(z.object({ fezId: z.string() }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      // Twitarr paginates posts: without ?start= it uses readCount to pick a window, so after many
      // messages the last page can be a single post (e.g. right after sending). Load from the start.
      const fezId = normalizeTwitarrUuid(input.fezId);
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

  fezJoin: publicProcedure
    .input(z.object({ fezId: z.string() }))
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const fezId = normalizeTwitarrUuid(input.fezId);
      const result = await FezService.fezJoin(fezId);
      return result as unknown;
    }),

  fezUnjoin: publicProcedure
    .input(z.object({ fezId: z.string() }))
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const fezId = normalizeTwitarrUuid(input.fezId);
      const result = await FezService.fezUnjoin(fezId);
      return result as unknown;
    }),

  /** Twitarr `GET /users/match/allnames/:search` — display name / username substring match. */
  usersMatchAllNames: publicProcedure
    .input(z.object({ search: z.string().min(2).max(80).trim() }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await UsersService.usersMatchAllNames(input.search);
      return result as unknown;
    }),

  /**
   * Create a seamail fez with a title, then invite each user via `POST /fez/:id/user/:user/add`.
   * Create body uses `{ title }`; servers that expect a different shape can be extended later.
   */
  fezCreateSeamail: publicProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200).trim(),
        userIds: z.array(z.string().min(1)).min(1).max(32),
      }),
    )
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);

      let created: unknown;
      let usedTitleInCreate = true;
      try {
        created = await twitarrFetchJson<unknown>('POST', '/fez/create', { title: input.title });
      } catch {
        usedTitleInCreate = false;
        created = await twitarrFetchJson<unknown>('POST', '/fez/create', {});
      }

      const fezIdRaw = pickCreatedFezId(created);
      if (!fezIdRaw) throw new Error('Server did not return a new conversation id');
      const fezId = normalizeTwitarrUuid(fezIdRaw);

      if (!usedTitleInCreate) {
        try {
          await twitarrFetchJson<unknown>('POST', `/fez/${encodeURIComponent(fezId)}`, { title: input.title });
        } catch {
          /* Fez update shape varies; title may stay default until user edits in-app */
        }
      }

      for (const uid of input.userIds) {
        const u = normalizeTwitarrUuid(uid.trim());
        try {
          await FezService.fezUserAdd(fezId, u);
        } catch {
          /* Often already a participant if create accepted `users`; ignore */
        }
      }

      return { fezId };
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
      const result = await ForumService.forumCategoryForums(normalizeTwitarrUuid(input.categoryId));
      return result as unknown;
    }),

  forumGet: publicProcedure
    .input(z.object({ forumId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token, username } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await ForumService.forumGet(normalizeTwitarrUuid(input.forumId));
      const viewed = getForumViewedIdSet(baseUrl, username);
      return mergeForumPayloadReadState(result as unknown, viewed);
    }),

  forumPostGet: publicProcedure
    .input(z.object({ postId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token, username } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await ForumService.forumPostGet(normalizeTwitarrUuid(input.postId));
      const viewed = getForumViewedIdSet(baseUrl, username);
      return mergeForumPayloadReadState(result as unknown, viewed);
    }),

  /** Persist locally viewed forum post ids (per server + username); merged into forumGet / forumPostGet as `cephalopodRead`. */
  forumPostsMarkViewed: publicProcedure
    .input(z.object({ postIds: z.array(z.string()).min(1).max(500) }))
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { username } = store.getState().auth;
      if (!baseUrl || !username) throw new Error('Not authenticated');
      markForumPostsViewed(baseUrl, username, input.postIds);
      return { ok: true as const };
    }),

  // ---- Hunts ----
  huntsList: publicProcedure.query(async () => {
    const { baseUrl } = store.getState().server;
    const { token } = store.getState().auth;
    if (!baseUrl || !token) throw new Error('Not authenticated');
    configureOpenAPI(baseUrl, token);
    const result = await HuntsService.huntsList();
    return result as unknown;
  }),

  huntGet: publicProcedure
    .input(z.object({ huntId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const id = normalizeTwitarrUuid(input.huntId);
      const result = await HuntsService.huntGet(id);
      return result as unknown;
    }),

  huntPuzzleGet: publicProcedure
    .input(z.object({ puzzleId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const id = normalizeTwitarrUuid(input.puzzleId);
      const result = await HuntsService.huntPuzzleGet(id);
      return result as unknown;
    }),

  huntPuzzleCallIn: publicProcedure
    .input(
      z.object({
        puzzleId: z.string().min(1),
        answer: z.string().min(1).max(4000),
      }),
    )
    .mutation(async ({ input }) => {
      const id = normalizeTwitarrUuid(input.puzzleId);
      return twitarrPostPlaintextForJson<unknown>(
        `/hunts/puzzles/${encodeURIComponent(id)}/callin`,
        input.answer,
      );
    }),

  // ---- Board games (onboard library) ----
  boardgamesList: publicProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          favorite: z.boolean().optional(),
          start: z.number().int().min(0).optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const result = await BoardgamesService.boardgamesList(
        input?.search,
        input?.favorite,
        input?.start,
        input?.limit ?? 50,
      );
      return result as unknown;
    }),

  boardgameGet: publicProcedure
    .input(z.object({ gameId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const id = normalizeTwitarrUuid(input.gameId);
      const result = await BoardgamesService.boardgameGet(id);
      return result as unknown;
    }),

  boardgameExpansions: publicProcedure
    .input(z.object({ gameId: z.string().min(1) }))
    .query(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const id = normalizeTwitarrUuid(input.gameId);
      const result = await BoardgamesService.boardgameExpansions(id);
      return result as unknown;
    }),

  boardgameFavoriteAdd: publicProcedure
    .input(z.object({ gameId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const id = normalizeTwitarrUuid(input.gameId);
      await BoardgamesService.boardgameFavoriteAdd(id);
      return { ok: true as const };
    }),

  boardgameFavoriteRemove: publicProcedure
    .input(z.object({ gameId: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { baseUrl } = store.getState().server;
      const { token } = store.getState().auth;
      if (!baseUrl || !token) throw new Error('Not authenticated');
      configureOpenAPI(baseUrl, token);
      const id = normalizeTwitarrUuid(input.gameId);
      await BoardgamesService.boardgameFavoriteRemoveAlt(id);
      return { ok: true as const };
    }),
});

export type AppRouter = typeof appRouter;
