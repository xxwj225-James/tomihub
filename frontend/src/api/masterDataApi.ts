import http from '@/lib/http';
import type { ApiResponse } from '@/types/auth';

export const masterDataApi = {
  list: (category: string, methodology?: string) => {
    const params = new URLSearchParams({ category });
    if (methodology) params.append('methodology', methodology);
    return http.get<ApiResponse<Array<{ key: string; value: string; color?: string; icon?: string }>>>(`/master-data?${params}`);
  },
};
