"use server"

import { supabase } from "./supabase"
import { revalidatePath } from "next/cache"

function generateGameCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function createGame(formData: FormData) {
  const title = formData.get("title") as string
  const gradeClass = formData.get("gradeClass") as string
  const duration = Number.parseInt(formData.get("duration") as string)
  const teamCount = Number.parseInt(formData.get("teamCount") as string)

  const gameCode = generateGameCode()

  try {
    // Create the game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({
        title,
        grade_class: gradeClass,
        duration,
        team_count: teamCount,
        game_code: gameCode,
      })
      .select()
      .single()

    if (gameError) throw gameError

    // Create teams for the game
    const teams = Array.from({ length: teamCount }, (_, i) => ({
      game_id: game.id,
      team_name: `Team ${i + 1}`,
      team_number: i + 1,
    }))

    const { error: teamsError } = await supabase.from("teams").insert(teams)

    if (teamsError) throw teamsError

    revalidatePath("/admin")
    return { success: true, gameId: game.id, gameCode }
  } catch (error) {
    console.error("Error creating game:", error)
    return { success: false, error: (error as Error).message || "Failed to create game" }
  }
}

export async function joinGame(gameCode: string, nickname: string, studentId?: string) {
  try {
    // Find the game
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, status")
      .eq("game_code", gameCode)
      .single()

    if (gameError || !game) {
      return { success: false, error: "Game not found" }
    }

    if (game.status !== "waiting") {
      return { success: false, error: "Game has already started" }
    }

    // Add participant
    const { data: participant, error: participantError } = await supabase
      .from("participants")
      .insert({
        game_id: game.id,
        nickname,
        student_id: studentId,
      })
      .select()
      .single()

    if (participantError) throw participantError

    return { success: true, gameId: game.id, participantId: participant.id }
  } catch (error) {
    console.error("Error joining game:", error)
    return { success: false, error: (error as Error).message || "Failed to join game" }
  }
}

export async function assignTeams(gameId: string, assignments: { participantId: string; teamId: string }[]) {
  try {
    const updates = assignments.map(({ participantId, teamId }) =>
      supabase.from("participants").update({ team_id: teamId }).eq("id", participantId),
    )

    await Promise.all(updates)
    revalidatePath(`/admin/game/${gameId}`)
    return { success: true }
  } catch (error) {
    console.error("Error assigning teams:", error)
    return { success: false, error: (error as Error).message || "Failed to assign teams" }
  }
}

export async function startGame(gameId: string) {
  try {
    console.log("startGame called with gameId:", gameId);
    const { error } = await supabase.from("games").update({ status: "started" }).eq("id", gameId)

    if (error) throw error

    revalidatePath(`/admin/game/${gameId}`)
    return { success: true }
  } catch (error) {
    console.error("Error starting game:", error)
    return { success: false, error: (error as Error).message || "Failed to start game" }
  }
}

export async function updateScore(teamId: string, newScore: number) {
  try {
    const { error } = await supabase.from("teams").update({ score: newScore }).eq("id", teamId)

    if (error) throw error

    return { success: true }
  } catch (error) {
    console.error("Error updating score:", error)
    return { success: false, error: (error as Error).message || "Failed to update score" }
  }
}

export async function nextRound(gameId: string) {
  try {
    // Get the current game state
    const { data: game, error: fetchError } = await supabase
      .from("games")
      .select("current_round, total_rounds")
      .eq("id", gameId)
      .single()

    if (fetchError) throw fetchError
    if (!game) throw new Error("Game not found")

    const { current_round, total_rounds } = game
    const nextRoundNumber = current_round + 1

    if (nextRoundNumber > total_rounds) {
      return { success: false, error: "Game has already reached the final round" }
    }

    const { error: updateError } = await supabase
      .from("games")
      .update({ current_round: nextRoundNumber })
      .eq("id", gameId)

    if (updateError) throw updateError

    revalidatePath(`/admin/game/${gameId}`)
    return { success: true, round: nextRoundNumber }
  } catch (error) {
    console.error("Error advancing round:", error)
    return { success: false, error: (error as Error).message || "Failed to advance round" }
  }
}

export async function updateTimeout(gameId: string, timeout: number) {
  try {
    const { error } = await supabase
      .from("games")
      .update({ round1_timeout_seconds: timeout })
      .eq("id", gameId)

    if (error) throw error

    revalidatePath(`/admin/game/${gameId}`)
    return { success: true }
  } catch (error) {
    console.error("Error updating timeout:", error)
    return { success: false, error: (error as Error).message || "Failed to update timeout" }
  }
}
