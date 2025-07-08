import { supabase } from "@/lib/supabase"
import { StudentGameView } from "@/components/student-game-view"
import { notFound } from "next/navigation"

interface PlayPageProps {
  params: {
    id: string
  }
  searchParams: {
    participant?: string
  }
}

export default async function PlayPage({ params, searchParams }: PlayPageProps) {
  const { data: game } = await supabase.from("games").select("*").eq("id", params.id).single()

  if (!game) {
    notFound()
  }

  const { data: participant } = searchParams.participant
    ? await supabase.from("participants").select("*").eq("id", searchParams.participant).single()
    : { data: null }

  const { data: teams } = await supabase
    .from("teams")
    .select("*")
    .eq("game_id", params.id)
    .order("score", { ascending: false })

  return <StudentGameView game={game} participant={participant} teams={teams || []} />
}
