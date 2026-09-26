/**
 * Centralized API client with error handling, retry logic, and request/response interceptors
 */

import { router } from 'expo-router';
import { config } from './config';
import { errorHandler, ErrorSeverity } from './error-handler';
import { clearSession, peekSessionToken } from '../session';

interface RequestConfig {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  error_code?: string;
}

class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number = 30000;
  private defaultRetries: number = 2;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Build a full request URL.
   *
   * IMPORTANT: this backend mounts routes at the ORIGIN (e.g. `/shopkeeper/...`,
   * `/store-owner/...`) — it does NOT have a global `/api` mount. Callers must
   * pass the exact path they need (including `/api` for the few routes that use
   * it, e.g. `/api/auth/...`). We only normalise the leading slash here.
   */
  private buildUrl(endpoint: string): string {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseUrl}${path}`;
  }

  /**
   * Make API request with error handling and retry logic
   */
  async request<T = any>(
    endpoint: string,
    config: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      // Only GET is safe to replay blindly. A POST/PUT/PATCH/DELETE that timed
      // out may already have been applied server-side (support message
      // stored, order accepted…), so retrying it duplicates the action.
      // Callers that know a mutation is idempotent can still opt in by
      // passing `retries` explicitly.
      retries = method === 'GET' ? this.defaultRetries : 0,
    } = config;

    const url = this.buildUrl(endpoint);
    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        const text = await response.text();
        let data: any;

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
        }

        if (response.status === 401) {
          // Session expired/revoked — no code path anywhere in this app was
          // clearing the session or navigating away, so an expired token left
          // every screen just showing empty data forever with no way back to
          // login short of manually finding Settings → Logout. Clear it and
          // send the shopkeeper back to the same screen a missing token
          // already redirects to on cold start (see home.tsx's bootstrap
          // effect), instead of leaving them stuck.
          //
          // Only do this when the token that was *rejected* is the token that
          // is *currently* active. A poll that started under account A and
          // resolves after the user logged out and signed in as B carries A's
          // stale token; its 401 must not wipe B's brand-new session.
          if (this.isCurrentSessionToken(headers)) {
            await clearSession();
            errorHandler.handleAuthError({ status: 401, endpoint, statusText: response.statusText });
            router.replace('/landing');
          }
        }

        if (!response.ok) {
          throw {
            status: response.status,
            statusText: response.statusText,
            data,
          };
        }

        return {
          success: true,
          data,
        };
      } catch (error: any) {
        lastError = error;

        // Don't retry on client errors (4xx)
        if (error.status && error.status >= 400 && error.status < 500) {
          break;
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      } finally {
        // Previously only cleared on the success path, so every failed
        // attempt leaked a live 30s timer holding the controller.
        clearTimeout(timeoutId);
      }
    }

    // All retries failed
    const errorMessage = this.getErrorMessage(lastError);
    const errorCode = lastError?.data?.error_code || 'REQUEST_FAILED';

    errorHandler.logError({
      message: errorMessage,
      code: errorCode,
      severity: ErrorSeverity.MEDIUM,
      context: { endpoint, method },
      originalError: lastError,
    });

    return {
      success: false,
      error: errorMessage,
      error_code: errorCode,
    };
  }

  /**
   * GET request
   */
  async get<T = any>(endpoint: string, headers?: Record<string, string>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', headers });
  }

  /**
   * POST request
   */
  async post<T = any>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'POST', body, headers });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PATCH', body, headers });
  }

  /**
   * PUT request
   */
  async put<T = any>(
    endpoint: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'PUT', body, headers });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(
    endpoint: string,
    headers?: Record<string, string>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE', headers });
  }

  /**
   * Get error message from error object
   */
  private getErrorMessage(error: any): string {
    // AbortError always carries a message ("Aborted"), so this check has to
    // come before the generic message fallback or it is unreachable.
    if (error?.name === 'AbortError') return 'Request timeout';
    if (error?.data?.error) return error.data.error;
    if (error?.data?.message) return error.data.message;
    if (error?.message) return error.message;
    if (error?.statusText) return error.statusText;
    return 'An unexpected error occurred';
  }

  /**
   * True when the request's bearer token is the one for the currently active
   * session (or when the request carried no bearer token at all, in which
   * case we keep the previous unconditional behaviour).
   */
  private isCurrentSessionToken(headers: Record<string, string>): boolean {
    const authHeader = Object.entries(headers).find(([k]) => k.toLowerCase() === 'authorization')?.[1];
    if (!authHeader) return true;
    const sent = authHeader.replace(/^Bearer\s+/i, '').trim();
    const current = peekSessionToken();
    // No active session → nothing to protect; a stale 401 can't do harm.
    if (!current) return true;
    return sent === current;
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const apiClient = new ApiClient(config.API_BASE);
export default apiClient;
