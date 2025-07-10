import { supabase } from "@/lib/supabase"
import { GameWaitingRoom } from "@/components/game-waiting-room"
import { notFound } from "next/navigation"

interface WaitPageProps {
  params: {
    id: string
  }
  searchParams: {
    participant?: string
  }
}

export default async function WaitPage({ params, searchParams }: WaitPageProps) {
  const { data: game } = await supabase.from("games").select("*").eq("id", params.id).single()

  if (!game) {
    notFound()
  }

  const participantId = searchParams.participant

  const { data: participant } = participantId
    ? await supabase.from("participants").select("*").eq("id", participantId).single()
    : { data: null }

  return <GameWaitingRoom game={game} participant={participant} />
}
