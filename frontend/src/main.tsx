import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById('root')!, {
  onRecoverableError: (error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("reading 'length'") && msg.includes('undefined')) return;
    // Render error — log to monitoring service when available
  },
}).render(
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </ErrorBoundary>,
);
