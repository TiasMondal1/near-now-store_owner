/**
 * Centralized error handling and logging
 * Integrates with error monitoring services (Sentry, etc.)
 */

import { Alert } from 'react-native';
import { config } from './config';

// Sentry is loaded lazily/defensively so the app still runs if the native
// module is missing (e.g. Expo Go) or no DSN is configured.
type SentryModule = typeof import('@sentry/react-native');
let Sentry: SentryModule | null = null;

function loadSentry(): SentryModule | null {
  if (Sentry) return Sentry;
  try {
    Sentry = require('@sentry/react-native') as SentryModule;
  } catch {
    Sentry = null;
  }
  return Sentry;
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AppError {
  message: string;
  code?: string;
  severity: ErrorSeverity;
  context?: Record<string, any>;
  originalError?: Error;
}

class ErrorHandler {
  private static instance: ErrorHandler;
  private errorMonitoringEnabled: boolean = false;

  private constructor() {
    this.setupGlobalErrorHandlers();
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Initialize error monitoring service (Sentry, Bugsnag, etc.)
   */
  initializeErrorMonitoring(): void {
    if (this.errorMonitoringEnabled) return;

    const dsn = config.SENTRY_DSN;
    if (!dsn) {
      // No DSN configured — run without remote monitoring (local console only).
      if (__DEV__) console.log('📊 Error monitoring disabled (no SENTRY_DSN set)');
      return;
    }

    const sentry = loadSentry();
    if (!sentry) {
      console.warn('📊 @sentry/react-native unavailable — remote monitoring disabled');
      return;
    }

    try {
      sentry.init({
        dsn,
        environment: config.ENVIRONMENT,
        // Capture unhandled JS errors and native crashes; sample light in prod.
        tracesSampleRate: config.ENVIRONMENT === 'production' ? 0.2 : 1.0,
        enableAutoSessionTracking: true,
        debug: false,
      });
      this.errorMonitoringEnabled = true;
      console.log('📊 Error monitoring initialized (Sentry)');
    } catch (e) {
      console.warn('📊 Failed to initialize Sentry:', e);
    }
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    if (typeof global !== 'undefined') {
      const globalWithErrorUtils = global as any;
      const originalHandler = globalWithErrorUtils.ErrorUtils?.getGlobalHandler();

      globalWithErrorUtils.ErrorUtils?.setGlobalHandler((error: any, isFatal: boolean) => {
        this.logError({
          message: error.message || 'Unknown error',
          severity: isFatal ? ErrorSeverity.CRITICAL : ErrorSeverity.HIGH,
          originalError: error,
          context: { isFatal },
        });

        if (originalHandler) {
          originalHandler(error, isFatal);
        }
      });
    }
  }

  /**
   * Log error to console and monitoring service
   */
  logError(error: AppError): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${error.severity.toUpperCase()}] ${error.message}`;

    // Console logging
    if (error.severity === ErrorSeverity.CRITICAL || error.severity === ErrorSeverity.HIGH) {
      console.error(logMessage, error.context || {});
    } else {
      console.warn(logMessage, error.context || {});
    }

    // Log original error if present
    if (error.originalError) {
      console.error('Original error:', error.originalError);
    }

    // Send to error monitoring service
    if (this.errorMonitoringEnabled) {
      this.sendToMonitoring(error);
    }
  }

  /**
   * Send error to monitoring service
   */
  private sendToMonitoring(error: AppError): void {
    const sentry = loadSentry();
    if (!sentry) return;
    try {
      sentry.captureException(error.originalError || new Error(error.message), {
        level: this.mapSeverityToSentryLevel(error.severity),
        tags: error.code ? { code: error.code } : undefined,
        extra: error.context,
      });
    } catch {
      // Never let error reporting throw.
    }
  }

  private mapSeverityToSentryLevel(severity: ErrorSeverity): 'fatal' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return 'fatal';
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warning';
      default:
        return 'info';
    }
  }

  /**
   * Handle API errors
   */
  handleApiError(error: any, context?: Record<string, any>): void {
    let message = 'An error occurred. Please try again.';
    let code = 'UNKNOWN_ERROR';
    let severity = ErrorSeverity.MEDIUM;

    if (error.response) {
      // Server responded with error
      code = error.response.data?.error_code || 'API_ERROR';
      message = error.response.data?.message || message;
      severity = error.response.status >= 500 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
    } else if (error.request) {
      // Request made but no response
      code = 'NETWORK_ERROR';
      message = 'Network error. Please check your connection.';
      severity = ErrorSeverity.MEDIUM;
    } else {
      // Error in request setup
      code = 'REQUEST_ERROR';
      message = error.message || message;
    }

    this.logError({
      message,
      code,
      severity,
      context: { ...context, url: error.config?.url },
      originalError: error,
    });
  }

  /**
   * Show user-friendly error alert
   */
  showErrorAlert(error: AppError, onDismiss?: () => void): void {
    Alert.alert(
      'Error',
      error.message,
      [
        {
          text: 'OK',
          onPress: onDismiss,
        },
      ],
      { cancelable: false }
    );
  }

  /**
   * Handle network errors
   */
  handleNetworkError(error: any): void {
    this.logError({
      message: 'Network connection failed',
      code: 'NETWORK_ERROR',
      severity: ErrorSeverity.MEDIUM,
      originalError: error,
    });

    Alert.alert(
      'Connection Error',
      'Unable to connect to the server. Please check your internet connection and try again.',
      [{ text: 'OK' }]
    );
  }

  /**
   * Handle authentication errors
   */
  handleAuthError(error: any): void {
    this.logError({
      message: 'Authentication failed',
      code: 'AUTH_ERROR',
      severity: ErrorSeverity.HIGH,
      originalError: error,
    });
  }
}

export const errorHandler = ErrorHandler.getInstance();

/**
 * Wrap the root React component with Sentry's error boundary / touch tracking.
 * Returns the component unchanged when Sentry is unavailable or no DSN is set,
 * so it is always safe to call.
 */
export function wrapRootComponent<T>(component: T): T {
  if (!config.SENTRY_DSN) return component;
  const sentry = loadSentry();
  if (!sentry?.wrap) return component;
  try {
    return sentry.wrap(component as any) as unknown as T;
  } catch {
    return component;
  }
}

/**
 * Utility function to wrap async functions with error handling
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: Record<string, any>
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      errorHandler.logError({
        message: error instanceof Error ? error.message : 'Unknown error',
        severity: ErrorSeverity.MEDIUM,
        context,
        originalError: error instanceof Error ? error : undefined,
      });
      throw error;
    }
  }) as T;
}
