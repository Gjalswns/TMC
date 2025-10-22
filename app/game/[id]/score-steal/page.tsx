import { supabase } from "@/lib/supabase";
import { ScoreStealPlayView } from "@/components/score-steal-play-view";
import { notFound } from "next/navigation";

interface ScoreStealPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    participant?: string;
  }>;
}

export default async function ScoreStealPage({
  params,
  searchParams,
}: ScoreStealPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  
  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();

  if (!game) {
    notFound();
  }

  // Get Score Steal session for current round
  let { data: session } = await supabase
    .from("score_steal_sessions")
    .select("id")
    .eq("game_id", id)
    .eq("round_number", game.current_round)
    .single();

  // If no session exists, create one automatically
  if (!session) {
    console.log(`🎮 No Score Steal session found for round ${game.current_round}, creating one...`);
    const { data: newSession, error: createError } = await supabase
      .from("score_steal_sessions")
      .insert({
        game_id: id,
        round_number: game.current_round,
        status: "waiting",
        phase: "waiting",
        created_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (createError) {
      console.error("❌ Failed to create Score Steal session:", createError);
      notFound();
    }
    
    session = newSession;
    console.log(`✅ Score Steal session created: ${session.id}`);
  }

  const teamsPromise = supabase
    .from("teams")
    .select("*")
    .eq("game_id", id)
    .order("team_number");

  const participantPromise = resolvedSearchParams.participant
    ? supabase
        .from("participants")
        .select("*")
        .eq("id", resolvedSearchParams.participant)
        .single()
    : Promise.resolve({ data: null, error: null });

  const [{ data: teams }, { data: participant }] = await Promise.all([
    teamsPromise,
    participantPromise,
  ]);

  if (!participant) {
    notFound();
  }

  return (
    <ScoreStealPlayView
      gameId={game.id}
      sessionId={session.id}
      currentRound={game.current_round}
      teamId={participant.team_id || ""}
      participantId={participant.id}
      teams={teams || []}
    />
  );
}
