/**
 * Centralized API client with error handling, retry logic, and request/response interceptors
 */

import { config } from './config';
import { errorHandler, ErrorSeverity } from './error-handler';

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
      retries = this.defaultRetries,
    } = config;

    const url = `${this.baseUrl}${endpoint}`;
    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const text = await response.text();
        let data: any;

        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = { raw: text };
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
    if (error?.data?.message) return error.data.message;
    if (error?.message) return error.message;
    if (error?.statusText) return error.statusText;
    if (error?.name === 'AbortError') return 'Request timeout';
    return 'An unexpected error occurred';
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
