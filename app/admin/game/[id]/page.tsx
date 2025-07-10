import { supabase } from "@/lib/supabase"
import { GameDashboard } from "@/components/game-dashboard"
import { notFound } from "next/navigation"

interface GamePageProps {
  params: {
    id: string
  }
}

export default async function GamePage({ params }: GamePageProps) {
  if (!params.id) {
    notFound(); // 또는 적절한 오류 처리
  }

  const { data: game } = await supabase.from("games").select("*, teams(*), participants(*)").eq("id", params.id).single()

  if (!game) {
    notFound()
  }

  const { data: teams } = await supabase.from("teams").select("*").eq("game_id", params.id).order("team_number")

  const { data: participants } = await supabase
    .from("participants")
    .select("*")
    .eq("game_id", params.id)
    .order("joined_at")

  return <GameDashboard game={game} teams={teams || []} participants={participants || []} />
}
