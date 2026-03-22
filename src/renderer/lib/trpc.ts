import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../shared/router';

export const trpc = createTRPCReact<AppRouter>();
