// TMC Game Constants
export const GAME_CONSTANTS = {
  // Team configuration
  MIN_TEAMS: 2,
  MAX_TEAMS: 10,
  RECOMMENDED_TEAMS: 4,
  PLAYERS_PER_TEAM: 4,

  // Game codes
  GAME_CODE_LENGTH: 2,
  GAME_CODE_MIN: 10,
  GAME_CODE_MAX: 99,

  // Year Game
  YEAR_GAME: {
    TARGET_RANGE_START: 1,
    TARGET_RANGE_END: 100,
    DEFAULT_TIME_LIMIT: 600, // 10 minutes
    DEFAULT_TARGET_NUMBERS: [3, 7, 12, 25],
  },

  // Score Steal
  SCORE_STEAL: {
    WRONG_ANSWER_PENALTY: -50,
    DIFFICULTIES: ['easy', 'medium', 'hard'] as const,
  },

  // Brackets
  BRACKETS: ['higher', 'lower'] as const,

  // Game status
  GAME_STATUS: ['waiting', 'started', 'finished'] as const,
  SESSION_STATUS: ['waiting', 'active', 'finished'] as const,

  // UI
  LOADING_DELAY: 300, // ms
  REALTIME_RECONNECT_DELAY: 2000, // ms
} as const

export const VALIDATION_MESSAGES = {
  GAME_CODE_REQUIRED: '게임 코드를 입력하세요',
  GAME_CODE_INVALID: '게임 코드는 10~99 사이의 2자리 숫자여야 합니다',
  PLAYER_REQUIRED: '참가할 선수를 선택하세요',
  TEAM_NAME_REQUIRED: '팀 이름을 입력하세요',
  PLAYER_NAME_REQUIRED: '선수 이름을 입력하세요',
  CSV_UPLOAD_FAILED: 'CSV 업로드에 실패했습니다',
  TEAMS_LOAD_FAILED: '팀 목록을 불러오는데 실패했습니다',
} as const

export const ROUTES = {
  HOME: '/',
  ADMIN: '/admin',
  ADMIN_PARTICIPANTS: '/admin/participants',
  JOIN: '/join',
  JOIN_NEW: '/join-new',
  GAME: (gameId: string) => `/game/${gameId}`,
  SCOREBOARD: (gameId: string) => `/scoreboard/${gameId}`,
  YEAR_GAME_SCOREBOARD: (sessionId: string) => `/year-game-scoreboard/${sessionId}`,
} as const