import { supabase } from "@/lib/supabase";
import { GameWaitingRoom } from "@/components/game-waiting-room";
import { notFound } from "next/navigation";

interface WaitPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    participant?: string;
  }>;
}

export default async function WaitPage({
  params,
  searchParams,
}: WaitPageProps) {
  try {
    // Await params and searchParams in Next.js 15
    const { id } = await params;
    const resolvedSearchParams = await searchParams;
    
    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("*")
      .eq("id", id)
      .single();

    if (gameError || !game) {
      console.error("Error fetching game:", gameError);
      notFound();
    }

    const participantId = resolvedSearchParams.participant;
    let participant = null;

    if (participantId) {
      const { data: participantData, error: participantError } = await supabase
        .from("participants")
        .select("*")
        .eq("id", participantId)
        .single();

      if (participantError) {
        console.error("Error fetching participant:", participantError);
        // Continue without participant data
      } else {
        participant = participantData;
      }
    }

    return <GameWaitingRoom game={game} participant={participant} />;
  } catch (error) {
    console.error("Unexpected error in WaitPage:", error);
    notFound();
  }
}
