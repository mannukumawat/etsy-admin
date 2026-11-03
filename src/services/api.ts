// Mock transport. Every service call goes through `mockRequest`, which adds latency and (optionally) random
// failures so loading and error states can be exercised. Backend phase: replace each handler with an HTTP call
// to VITE_API_BASE_URL returning the same types.

export interface FieldIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public code: 'validation' | 'not_found' | 'conflict' | 'in_use' | 'unauthorized' | 'network',
    message: string,
    public issues: FieldIssue[] = [],
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isTest = import.meta.env?.MODE === 'test';

function failureRate(): number {
  const n = Number(import.meta.env?.VITE_MOCK_FAILURE_RATE ?? 0);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

export async function mockRequest<T>(handler: () => T, latency: [number, number] = [180, 480]): Promise<T> {
  if (!isTest) {
    await delay(latency[0] + Math.random() * (latency[1] - latency[0]));
    if (Math.random() < failureRate()) throw new ApiError('network', 'Simulated network error. Please try again.');
  }
  // Clone so callers can never mutate the in-memory "database" by reference.
  return structuredClone(handler());
}

export function validationError(issues: FieldIssue[], message = 'Please fix the highlighted fields.'): ApiError {
  return new ApiError('validation', message, issues);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
