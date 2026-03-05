/**
 * Centralized logging utility
 * Replaces console.log with structured logging
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  showTimestamp: boolean;
}

const config: LogConfig = {
  enabled: __DEV__, // Only log in development
  level: 'debug',
  showTimestamp: true,
};

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const COLORS = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return config.enabled && LEVELS[level] >= LEVELS[config.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = config.showTimestamp ? new Date().toISOString() : '';
    const prefix = `${COLORS[level]} [${this.context}]`;
    const timeStr = timestamp ? `[${timestamp}]` : '';
    
    let formatted = `${prefix} ${timeStr} ${message}`;
    
    if (data !== undefined) {
      formatted += '\n' + JSON.stringify(data, null, 2);
    }
    
    return formatted;
  }

  debug(message: string, data?: any) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }

  info(message: string, data?: any) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  warn(message: string, data?: any) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  error(message: string, error?: any) {
    if (this.shouldLog('error')) {
      const errorData = error instanceof Error 
        ? { message: error.message, stack: error.stack }
        : error;
      console.error(this.formatMessage('error', message, errorData));
    }
  }

  // Performance timing
  time(label: string) {
    if (config.enabled) {
      console.time(`${this.context}:${label}`);
    }
  }

  timeEnd(label: string) {
    if (config.enabled) {
      console.timeEnd(`${this.context}:${label}`);
    }
  }
}

// Factory function to create loggers
export function createLogger(context: string): Logger {
  return new Logger(context);
}

// Configure logging
export function configureLogger(options: Partial<LogConfig>) {
  Object.assign(config, options);
}

// Export default logger
export const logger = createLogger('App');
