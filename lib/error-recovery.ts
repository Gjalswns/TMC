/**
 * Error Recovery and Retry Logic
 * 
 * Handles network failures, timeouts, and other errors gracefully
 * with exponential backoff and circuit breaker patterns.
 */

interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  shouldRetry: (error: Error) => {
    // Retry on network errors, timeouts, and 5xx server errors
    return (
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed')
    );
  },
  onRetry: (error: Error, attempt: number) => {
    console.warn(`⚠️ Retry attempt ${attempt} after error:`, error.message);
  },
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: Error | null = null;
  let delay = opts.initialDelay;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if we should retry
      if (attempt > opts.maxRetries || !opts.shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      // Call retry callback
      opts.onRetry(lastError, attempt);

      // Wait before retrying
      await sleep(delay);

      // Increase delay with exponential backoff
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Circuit Breaker to prevent cascading failures
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private threshold: number = 5, // Open circuit after 5 failures
    private timeout: number = 60000, // Try again after 60 seconds
    private resetTimeout: number = 10000 // Reset after 10 seconds of success
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        console.log('🔄 Circuit breaker: Entering HALF_OPEN state');
        this.state = 'HALF_OPEN';
      } else {
        const error = new Error('Circuit breaker is OPEN');
        console.error('⛔ Circuit breaker: Rejecting request (circuit is OPEN)');
        throw error;
      }
    }

    try {
      const result = await fn();
      
      if (this.state === 'HALF_OPEN') {
        console.log('✅ Circuit breaker: Success in HALF_OPEN, resetting to CLOSED');
        this.reset();
      } else if (this.failures > 0) {
        // Gradually reset failures on success
        this.failures = Math.max(0, this.failures - 1);
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      console.error(`⛔ Circuit breaker: Opening circuit after ${this.failures} failures`);
      this.state = 'OPEN';
    }
  }

  private reset(): void {
    this.failures = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Timeout wrapper for promises
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Batch requests to reduce server load
 */
export class RequestBatcher<T, R> {
  private queue: Array<{
    key: T;
    resolve: (value: R) => void;
    reject: (error: Error) => void;
  }> = [];
  private timeout: NodeJS.Timeout | null = null;

  constructor(
    private batchFn: (keys: T[]) => Promise<R[]>,
    private delay: number = 50 // Batch requests within 50ms
  ) {}

  async request(key: T): Promise<R> {
    return new Promise((resolve, reject) => {
      this.queue.push({ key, resolve, reject });

      if (this.timeout) {
        clearTimeout(this.timeout);
      }

      this.timeout = setTimeout(() => {
        this.flush();
      }, this.delay);
    });
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    const keys = batch.map(item => item.key);

    try {
      console.log(`📦 Batching ${keys.length} requests`);
      const results = await this.batchFn(keys);

      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });
    } catch (error) {
      batch.forEach(item => {
        item.reject(error as Error);
      });
    }

    this.timeout = null;
  }
}

/**
 * Error recovery utilities
 */
export const ErrorRecovery = {
  /**
   * Handle database errors with retry
   */
  async withDatabaseRetry<T>(fn: () => Promise<T>): Promise<T> {
    return retryWithBackoff(fn, {
      maxRetries: 3,
      initialDelay: 500,
      shouldRetry: (error) => {
        const message = error.message.toLowerCase();
        return (
          message.includes('connection') ||
          message.includes('timeout') ||
          message.includes('deadlock') ||
          message.includes('lock timeout')
        );
      },
    });
  },

  /**
   * Handle API calls with retry and timeout
   */
  async withApiRetry<T>(
    fn: () => Promise<T>,
    timeoutMs: number = 30000
  ): Promise<T> {
    return retryWithBackoff(
      () => withTimeout(fn(), timeoutMs),
      {
        maxRetries: 2,
        initialDelay: 1000,
        shouldRetry: (error) => {
          const message = error.message.toLowerCase();
          return (
            message.includes('network') ||
            message.includes('timeout') ||
            message.includes('fetch')
          );
        },
      }
    );
  },

  /**
   * Graceful degradation - return fallback on error
   */
  async withFallback<T>(
    fn: () => Promise<T>,
    fallback: T
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      console.warn('⚠️ Operation failed, using fallback:', error);
      return fallback;
    }
  },
};

/**
 * Global circuit breakers for different services
 */
export const circuitBreakers = {
  database: new CircuitBreaker(5, 60000, 10000),
  realtime: new CircuitBreaker(3, 30000, 5000),
  api: new CircuitBreaker(5, 60000, 10000),
};

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Monitor and log circuit breaker states
 */
if (typeof window !== 'undefined') {
  setInterval(() => {
    const states = {
      database: circuitBreakers.database.getState(),
      realtime: circuitBreakers.realtime.getState(),
      api: circuitBreakers.api.getState(),
    };

    const hasIssues = Object.values(states).some(
      state => state.state !== 'CLOSED' || state.failures > 0
    );

    if (hasIssues) {
      console.log('⚠️ Circuit breaker states:', states);
    }
  }, 30000); // Check every 30 seconds
}
