import { GAME_CONSTANTS, VALIDATION_MESSAGES } from './constants'

// Game code validation
export function validateGameCode(code: string): { isValid: boolean; message?: string } {
  if (!code?.trim()) {
    return { isValid: false, message: VALIDATION_MESSAGES.GAME_CODE_REQUIRED }
  }

  const trimmedCode = code.trim()
  const codeNum = parseInt(trimmedCode)
  
  if (
    !/^\d{2}$/.test(trimmedCode) || 
    codeNum < GAME_CONSTANTS.GAME_CODE_MIN || 
    codeNum > GAME_CONSTANTS.GAME_CODE_MAX
  ) {
    return { isValid: false, message: VALIDATION_MESSAGES.GAME_CODE_INVALID }
  }

  return { isValid: true }
}

// Player name validation
export function validatePlayerName(name: string): { isValid: boolean; message?: string } {
  if (!name?.trim()) {
    return { isValid: false, message: VALIDATION_MESSAGES.PLAYER_NAME_REQUIRED }
  }

  const trimmedName = name.trim()
  if (trimmedName.length < 2 || trimmedName.length > 50) {
    return { isValid: false, message: '선수 이름은 2-50자 사이여야 합니다' }
  }

  return { isValid: true }
}

// Team name validation
export function validateTeamName(name: string): { isValid: boolean; message?: string } {
  if (!name?.trim()) {
    return { isValid: false, message: VALIDATION_MESSAGES.TEAM_NAME_REQUIRED }
  }

  const trimmedName = name.trim()
  if (trimmedName.length < 2 || trimmedName.length > 50) {
    return { isValid: false, message: '팀 이름은 2-50자 사이여야 합니다' }
  }

  return { isValid: true }
}

// CSV data validation
export function validateCSVData(data: any[]): { isValid: boolean; message?: string; validData?: any[] } {
  if (!Array.isArray(data) || data.length === 0) {
    return { isValid: false, message: 'CSV 데이터가 비어있습니다' }
  }

  const validData = []
  const errors = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const rowNum = i + 2 // +2 because of header row and 0-based index

    if (!row.player_name?.trim()) {
      errors.push(`${rowNum}행: 선수 이름이 필요합니다`)
      continue
    }

    if (!row.team_name?.trim()) {
      errors.push(`${rowNum}행: 팀 이름이 필요합니다`)
      continue
    }

    if (!['higher', 'lower'].includes(row.bracket)) {
      errors.push(`${rowNum}행: 브래킷은 'higher' 또는 'lower'여야 합니다`)
      continue
    }

    const playerNumber = row.player_number ? parseInt(row.player_number) : null
    if (playerNumber !== null && (isNaN(playerNumber) || playerNumber < 1 || playerNumber > 10)) {
      errors.push(`${rowNum}행: 선수 번호는 1-10 사이의 숫자여야 합니다`)
      continue
    }

    validData.push({
      player_name: row.player_name.trim(),
      team_name: row.team_name.trim(),
      bracket: row.bracket,
      player_number: playerNumber
    })
  }

  if (errors.length > 0) {
    return { isValid: false, message: errors.join('\n') }
  }

  return { isValid: true, validData }
}

// Bracket validation
export function validateBracket(bracket: string): bracket is 'higher' | 'lower' {
  return GAME_CONSTANTS.BRACKETS.includes(bracket as any)
}