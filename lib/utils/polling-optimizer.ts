/**
 * 폴링 최적화 유틸리티
 * AWS 비용 절약을 위한 스마트 폴링 전략
 */

interface PollingConfig {
  baseInterval: number;
  maxInterval: number;
  backoffMultiplier: number;
  resetThreshold: number;
}

export class PollingOptimizer {
  private consecutiveNoChanges = 0;
  private currentInterval: number;
  private config: PollingConfig;

  constructor(config: Partial<PollingConfig> = {}) {
    this.config = {
      baseInterval: 3000,      // 기본 3초
      maxInterval: 15000,      // 최대 15초
      backoffMultiplier: 1.5,  // 1.5배씩 증가
      resetThreshold: 2,       // 2번 변화 없으면 간격 증가
      ...config
    };
    this.currentInterval = this.config.baseInterval;
  }

  /**
   * 변화가 감지되었을 때 호출
   */
  onChangeDetected(): number {
    this.consecutiveNoChanges = 0;
    this.currentInterval = this.config.baseInterval;
    return this.currentInterval;
  }

  /**
   * 변화가 없을 때 호출
   */
  onNoChange(): number {
    this.consecutiveNoChanges++;
    
    if (this.consecutiveNoChanges >= this.config.resetThreshold) {
      this.currentInterval = Math.min(
        this.config.maxInterval,
        this.currentInterval * this.config.backoffMultiplier
      );
    }
    
    return this.currentInterval;
  }

  /**
   * 현재 폴링 간격 반환
   */
  getCurrentInterval(): number {
    return this.currentInterval;
  }

  /**
   * 통계 정보 반환
   */
  getStats() {
    return {
      consecutiveNoChanges: this.consecutiveNoChanges,
      currentInterval: this.currentInterval,
      efficiency: this.config.baseInterval / this.currentInterval
    };
  }
}

/**
 * 게임 상태별 최적화된 폴링 설정
 */
export const GAME_POLLING_CONFIGS = {
  waiting: {
    baseInterval: 5000,   // 대기 중일 때는 5초
    maxInterval: 20000,   // 최대 20초
    backoffMultiplier: 2, // 2배씩 증가
    resetThreshold: 3
  },
  active: {
    baseInterval: 2000,   // 활성 상태일 때는 2초
    maxInterval: 8000,    // 최대 8초
    backoffMultiplier: 1.3,
    resetThreshold: 2
  },
  completed: {
    baseInterval: 10000,  // 완료 후에는 10초
    maxInterval: 30000,   // 최대 30초
    backoffMultiplier: 2,
    resetThreshold: 1
  }
} as const;