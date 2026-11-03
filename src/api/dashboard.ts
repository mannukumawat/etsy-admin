import type { DashboardMetrics, DateRange } from '@/types';
import { apiClient } from './client';

export function fetchDashboard(range: DateRange, signal?: AbortSignal): Promise<DashboardMetrics> {
  return apiClient.get<DashboardMetrics>('/api/admin/dashboard', { query: { from: range.from, to: range.to }, signal });
}
