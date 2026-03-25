import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, loggerLink } from '@trpc/client';
import superjson from 'superjson';
import { ConfigProvider } from 'antd';
import { theme } from 'antd';
import { trpc } from './lib/trpc';
import App from './App';
import './global.css';

/**
 * Desktop: avoid refetch storms on every window focus; rely on longer `staleTime` and explicit
 * `refetchInterval` / per-query overrides where data must stay fresh (seamail, open chats, etc.).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

/** tRPC HTTP server port (must match main process) */
const TRPC_PORT = 3847;

/** Dark shell palette; accent #6F458F */
const antTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    fontFamily: "'Reddit Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    colorBgBase: '#16171C',
    colorBgLayout: '#16171C',
    colorBgContainer: '#2A2D34',
    colorBgElevated: '#292B32',
    colorBgSpotlight: 'rgba(111, 69, 143, 0.2)',
    colorBorder: '#3d4149',
    colorBorderSecondary: '#2d3038',
    colorText: '#EFECE2',
    colorTextSecondary: '#9A9D9A',
    colorTextTertiary: '#7A7490',
    colorPrimary: '#6F458F',
    colorPrimaryHover: '#8E5CB5',
    colorPrimaryActive: '#583570',
    colorTextLightSolid: '#EFECE2',
    colorSuccess: '#6F458F',
    colorSuccessBg: 'rgba(111, 69, 143, 0.18)',
    colorError: '#D1544E',
    colorErrorBg: 'rgba(209, 84, 78, 0.15)',
    borderRadius: 8,
    borderRadiusLG: 10,
    borderRadiusSM: 6,
  },
  components: {
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(111, 69, 143, 0.22)',
      itemHoverBg: 'rgba(255, 255, 255, 0.06)',
      itemSelectedColor: '#B89BC9',
      itemColor: '#9A9D9A',
    },
    Input: {
      activeBorderColor: '#8E5CB5',
      hoverBorderColor: '#7A7490',
      colorBgContainer: '#1B1D23',
    },
    Button: {
      primaryShadow: 'none',
      defaultShadow: 'none',
    },
    Layout: {
      siderBg: '#2C3031',
      bodyBg: '#1B1D23',
      headerBg: '#16171C',
    },
    List: {
      colorText: '#EFECE2',
    },
  },
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ConfigProvider theme={antTheme}>
    <trpc.Provider
      client={trpc.createClient({
        links: [
          loggerLink({
            enabled: () => true,
          }),
          httpBatchLink({
            url: `http://127.0.0.1:${TRPC_PORT}/trpc`,
            transformer: superjson,
          }),
        ],
      })}
      queryClient={queryClient}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  </ConfigProvider>
);
