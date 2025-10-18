/**
 * ==============================================================
 * ERROR RECOVERY SYSTEM
 * ==============================================================
 * Comprehensive error handling with automatic recovery
 * Implements Circuit Breaker pattern and retry logic
 * 
 * Features:
 * - Circuit Breaker pattern
 * - Exponential backoff retry
 * - Error classification
 * - Automatic recovery
 * - Graceful degradation
 * - Error logging and tracking
 * 
 * @version 1.0.0
 * @date 2025-10-18
 * ==============================================================
 */

// ==============================================================
// TYPES
// ==============================================================

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum CircuitState {
  CLOSED = 'closed',    // Normal operation
  OPEN = 'open',        // Failures detected, requests blocked
  HALF_OPEN = 'half_open', // Testing if service recovered
}

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  monitoringPeriod?: number;
  volumeThreshold?: number;
}

export interface ErrorRecord {
  error: Error;
  timestamp: Date;
  severity: ErrorSeverity;
  context?: Record<string, any>;
  recovered: boolean;
  recoveryAttempts: number;
}

export interface RecoveryStats {
  totalErrors: number;
  recoveredErrors: number;
  failedRecoveries: number;
  recoveryRate: number;
  averageRecoveryTime: number;
  errorsByType: Record<string, number>;
}

// ==============================================================
// CIRCUIT BREAKER
// ==============================================================

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number = 0;
  private requestCount: number = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly monitoringPeriod: number;
  private readonly volumeThreshold: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 10000; // 10 seconds
    this.volumeThreshold = options.volumeThreshold || 10;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check circuit state
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error(
          `Circuit breaker is OPEN. Next attempt in ${
            (this.nextAttemptTime - Date.now()) / 1000
          }s`
        );
      }
      // Try to recover
      this.state = CircuitState.HALF_OPEN;
      console.log('[CircuitBreaker] Transitioning to HALF_OPEN');
    }

    this.requestCount++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.successCount++;

    if (this.state === CircuitState.HALF_OPEN) {
      console.log('[CircuitBreaker] Service recovered, closing circuit');
      this.state = CircuitState.CLOSED;
      this.successCount = 0;
      this.requestCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    // Check if we should open the circuit
    if (
      this.requestCount >= this.volumeThreshold &&
      this.failureCount >= this.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.resetTimeout;
      console.error(
        `[CircuitBreaker] Circuit OPENED due to ${this.failureCount} failures`
      );
    }

    // Reset monitoring window
    setTimeout(() => {
      if (this.state === CircuitState.CLOSED) {
        this.failureCount = 0;
        this.successCount = 0;
        this.requestCount = 0;
      }
    }, this.monitoringPeriod);
  }

  getState(): CircuitState {
    return this.state;
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime
        ? new Date(this.lastFailureTime)
        : null,
    };
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = 0;
    console.log('[CircuitBreaker] Circuit manually reset');
  }
}

// ==============================================================
// RETRY WITH EXPONENTIAL BACKOFF
// ==============================================================

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableErrors = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'],
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const isRetryable = retryableErrors.some((retryableError) =>
        lastError.message.includes(retryableError)
      );

      if (!isRetryable || attempt === maxAttempts - 1) {
        throw lastError;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt) + Math.random() * 1000,
        maxDelay
      );

      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxAttempts} failed. Retrying in ${delay}ms...`,
        lastError.message
      );

      onRetry?.(attempt + 1, lastError);

      await sleep(delay);
    }
  }

  throw lastError!;
}

// ==============================================================
// ERROR RECOVERY MANAGER
// ==============================================================

export class ErrorRecoveryManager {
  private errorHistory: ErrorRecord[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private maxHistorySize: number = 100;

  /**
   * Record an error
   */
  recordError(
    error: Error,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context?: Record<string, any>
  ): void {
    const record: ErrorRecord = {
      error,
      timestamp: new Date(),
      severity,
      context,
      recovered: false,
      recoveryAttempts: 0,
    };

    this.errorHistory.push(record);

    // Maintain max history size
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }

    // Log based on severity
    this.logError(record);
  }

  /**
   * Attempt to recover from error
   */
  async attemptRecovery<T>(
    fn: () => Promise<T>,
    serviceName: string,
    options?: RetryOptions & CircuitBreakerOptions
  ): Promise<T> {
    // Get or create circuit breaker for this service
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker(options));
    }

    const circuitBreaker = this.circuitBreakers.get(serviceName)!;

    try {
      return await circuitBreaker.execute(async () => {
        return await retryWithBackoff(fn, options);
      });
    } catch (error) {
      this.recordError(error as Error, this.classifyError(error as Error), {
        serviceName,
        circuitState: circuitBreaker.getState(),
      });
      throw error;
    }
  }

  /**
   * Classify error severity
   */
  private classifyError(error: Error): ErrorSeverity {
    const message = error.message.toLowerCase();

    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection')
    ) {
      return ErrorSeverity.HIGH;
    }

    if (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('authentication')
    ) {
      return ErrorSeverity.CRITICAL;
    }

    if (
      message.includes('not found') ||
      message.includes('invalid') ||
      message.includes('validation')
    ) {
      return ErrorSeverity.LOW;
    }

    return ErrorSeverity.MEDIUM;
  }

  /**
   * Log error based on severity
   */
  private logError(record: ErrorRecord): void {
    const { error, severity, context } = record;

    const logData = {
      message: error.message,
      stack: error.stack,
      timestamp: record.timestamp,
      context,
    };

    switch (severity) {
      case ErrorSeverity.CRITICAL:
        console.error('[ERROR:CRITICAL]', logData);
        break;
      case ErrorSeverity.HIGH:
        console.error('[ERROR:HIGH]', logData);
        break;
      case ErrorSeverity.MEDIUM:
        console.warn('[ERROR:MEDIUM]', logData);
        break;
      case ErrorSeverity.LOW:
        console.log('[ERROR:LOW]', logData);
        break;
    }
  }

  /**
   * Get recovery statistics
   */
  getStats(): RecoveryStats {
    const totalErrors = this.errorHistory.length;
    const recoveredErrors = this.errorHistory.filter((r) => r.recovered).length;
    const failedRecoveries = totalErrors - recoveredErrors;

    const errorsByType: Record<string, number> = {};
    this.errorHistory.forEach((record) => {
      const type = record.error.name || 'Unknown';
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    });

    return {
      totalErrors,
      recoveredErrors,
      failedRecoveries,
      recoveryRate:
        totalErrors > 0 ? (recoveredErrors / totalErrors) * 100 : 0,
      averageRecoveryTime: this.calculateAverageRecoveryTime(),
      errorsByType,
    };
  }

  private calculateAverageRecoveryTime(): number {
    const recoveredErrors = this.errorHistory.filter((r) => r.recovered);
    if (recoveredErrors.length === 0) return 0;

    const totalTime = recoveredErrors.reduce(
      (sum, record) => sum + record.recoveryAttempts * 1000,
      0
    );

    return totalTime / recoveredErrors.length;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(serviceName: string) {
    const breaker = this.circuitBreakers.get(serviceName);
    return breaker ? breaker.getStats() : null;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(serviceName: string): void {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }
}

// ==============================================================
// UTILITY FUNCTIONS
// ==============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Safe async function wrapper
 */
export function safeAsync<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  fallback?: ReturnType<T>,
  onError?: (error: Error) => void
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error('[SafeAsync] Error caught:', error);
      onError?.(error as Error);
      return fallback;
    }
  }) as T;
}

// ==============================================================
// SINGLETON INSTANCE
// ==============================================================

let globalRecoveryManager: ErrorRecoveryManager | null = null;

export function getRecoveryManager(): ErrorRecoveryManager {
  if (!globalRecoveryManager) {
    globalRecoveryManager = new ErrorRecoveryManager();
  }
  return globalRecoveryManager;
}

// ==============================================================
// CONVENIENCE FUNCTIONS
// ==============================================================

export const recovery = {
  attempt: <T>(
    fn: () => Promise<T>,
    serviceName: string,
    options?: RetryOptions & CircuitBreakerOptions
  ) => getRecoveryManager().attemptRecovery(fn, serviceName, options),
  
  recordError: (
    error: Error,
    severity?: ErrorSeverity,
    context?: Record<string, any>
  ) => getRecoveryManager().recordError(error, severity, context),
  
  getStats: () => getRecoveryManager().getStats(),
  
  getCircuitStatus: (serviceName: string) =>
    getRecoveryManager().getCircuitBreakerStatus(serviceName),
  
  reset: (serviceName: string) =>
    getRecoveryManager().resetCircuitBreaker(serviceName),
};

// ==============================================================
// EXPORT
// ==============================================================

export default ErrorRecoveryManager;
