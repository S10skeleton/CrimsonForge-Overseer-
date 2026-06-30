import { QueryClient } from '@tanstack/react-query'

// Shared TanStack Query client. Sane defaults for an internal ops panel:
// data stays fresh for 30s, one retry on failure, no refetch storm on focus.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})
