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

const queryClient = new QueryClient();

/** tRPC HTTP server port (must match main process) */
const TRPC_PORT = 3847;

/** Palette sampled from cephalopod/desktop-app.png */
const antTheme = {
  algorithm: theme.darkAlgorithm,
  token: {
    fontFamily: "'Reddit Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: 14,
    colorBgBase: '#16171C',
    colorBgLayout: '#16171C',
    colorBgContainer: '#2A2D34',
    colorBgElevated: '#292B32',
    colorBgSpotlight: 'rgba(173, 253, 67, 0.14)',
    colorBorder: '#3d4149',
    colorBorderSecondary: '#2d3038',
    colorText: '#EFECE2',
    colorTextSecondary: '#9A9D9A',
    colorTextTertiary: '#7A7490',
    colorPrimary: '#ADFD43',
    colorPrimaryHover: '#c5fe6a',
    colorPrimaryActive: '#95e030',
    colorTextLightSolid: '#16171C',
    colorSuccess: '#ADFD43',
    colorSuccessBg: 'rgba(173, 253, 67, 0.12)',
    colorError: '#D1544E',
    colorErrorBg: 'rgba(209, 84, 78, 0.15)',
    borderRadius: 8,
    borderRadiusLG: 10,
    borderRadiusSM: 6,
  },
  components: {
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(173, 253, 67, 0.14)',
      itemHoverBg: 'rgba(255, 255, 255, 0.06)',
      itemSelectedColor: '#ADFD43',
      itemColor: '#9A9D9A',
    },
    Input: {
      activeBorderColor: '#ADFD43',
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
