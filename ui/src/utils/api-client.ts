/**
 * REST API Client for Cloudflare Worker
 * Direct fetch-based client for the Worker REST API endpoints
 */

interface ApiError {
  error: string;
  message?: string;
}

interface PaginationInput {
  limit?: number;
  offset?: number;
}

// =============================================================================
// API Client
// =============================================================================

class WorkerApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json()) as ApiError;
      throw new Error(error.error || error.message || 'API request failed');
    }

    return response.json();
  }

  private get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  // ===========================================================================
  // HEALTH
  // ===========================================================================

  async ping() {
    return this.get<{ status: string; timestamp: string }>('/api/ping');
  }

  async protected() {
    return this.get<{ message: string; accountId: string; timestamp: string }>('/api/protected');
  }

  // ===========================================================================
  // ADMIN
  // ===========================================================================

  async adminStats() {
    return this.get<{
      conversations: number;
      messages: number;
      kvEntries: number;
    }>('/api/admin/stats');
  }

  // ===========================================================================
  // USER
  // ===========================================================================

  async getUserRank(accountId: string) {
    return this.get<{
      rank: string | null;
      tokenId: string | null;
      hasNft: boolean;
      hasInitiate: boolean;
    }>(`/api/user/rank/${accountId}`);
  }

  // ===========================================================================
  // KEY VALUE
  // ===========================================================================

  async getValue(key: string) {
    return this.get<{
      key: string;
      value: string;
      createdAt: string;
      updatedAt: string;
    }>(`/api/kv/${encodeURIComponent(key)}`);
  }

  async setValue(key: string, value: string) {
    return this.post<{
      key: string;
      value: string;
      createdAt: string;
      updatedAt: string;
    }>(`/api/kv/${encodeURIComponent(key)}`, { value });
  }

  // ===========================================================================
  // CHAT
  // ===========================================================================

  async chat(message: string, conversationId?: string) {
    return this.post<{
      id: string;
      message: string;
      role: string;
      createdAt: string;
    }>('/api/chat', { message, conversationId });
  }

  async chatStream(message: string, conversationId?: string): Promise<ReadableStream> {
    const url = `${this.baseUrl}/api/chat/stream`;
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationId }),
    });

    if (!response.ok) {
      throw new Error('Stream request failed');
    }

    return response.body!;
  }

  async getConversation(id: string, pagination: PaginationInput = {}) {
    const params = new URLSearchParams();
    if (pagination.limit) params.set('limit', String(pagination.limit));
    if (pagination.offset) params.set('offset', String(pagination.offset));

    const queryString = params.toString();
    return this.get<{
      conversation: {
        id: string;
        title: string;
        nearAccountId: string;
        createdAt: string;
        updatedAt: string;
      };
      messages: Array<{
        id: string;
        role: string;
        content: string;
        createdAt: string;
      }>;
      pagination: {
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    }>(`/api/conversations/${encodeURIComponent(id)}${queryString ? `?${queryString}` : ''}`);
  }

  // ===========================================================================
  // BUILDERS
  // ===========================================================================

  async getBuilders(path = 'collections', params: Record<string, string> = {}) {
    const queryParams = new URLSearchParams({ path, ...params }).toString();
    return this.get<any>(`/api/builders?${queryParams}`);
  }

  async postBuilders(path = 'collections', params: Record<string, string> = {}) {
    return this.post<any>('/api/builders', { path, params });
  }

  async getBuilderById(id: string, params: Record<string, string> = {}) {
    const queryParams = new URLSearchParams(params).toString();
    return this.get<any>(`/api/builders/${encodeURIComponent(id)}${queryParams ? `?${queryParams}` : ''}`);
  }
}

// =============================================================================
// CLIENT FACTORY
// =============================================================================

function getWorkerUrl(): string {
  if (typeof window === 'undefined') {
    // Server-side: use the main deployment URL
    return 'https://near-agent.pages.dev';
  }

  // Always use same-origin to avoid CORS issues
  // Cloudflare Pages middleware proxies /api/* requests to the worker
  return window.location.origin;
}

export const apiClient = new WorkerApiClient(getWorkerUrl());

// For backwards compatibility with oRPC imports
export { apiClient as orpc };
