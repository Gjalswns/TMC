import { supabase } from "@/lib/supabase";
import { RelayQuizPlayView } from "@/components/relay-quiz-play-view";
import { notFound } from "next/navigation";

interface RelayQuizPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    participant?: string;
  }>;
}

export default async function RelayQuizPage({
  params,
  searchParams,
}: RelayQuizPageProps) {
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
    <RelayQuizPlayView
      gameId={game.id}
      currentRound={game.current_round}
      teamId={participant.team_id || ""}
      participantId={participant.id}
      teams={teams || []}
    />
  );
}
