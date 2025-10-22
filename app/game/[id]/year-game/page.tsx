import { supabase } from "@/lib/supabase";
import { YearGamePlayView } from "@/components/year-game-play-view";
import { notFound } from "next/navigation";

interface YearGamePageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    participant?: string;
  }>;
}

export default async function YearGamePage({
  params,
  searchParams,
}: YearGamePageProps) {
  // Await params and searchParams in Next.js 15
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
    <YearGamePlayView
      game={game}
      participant={participant}
      teams={teams || []}
    />
  );
}
