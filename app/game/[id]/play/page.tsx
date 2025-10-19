import { supabase } from "@/lib/supabase";
import { StudentGameView } from "@/components/student-game-view";
import { notFound, redirect } from "next/navigation";

interface PlayPageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    participant?: string;
  }>;
}

export default async function PlayPage({
  params,
  searchParams,
}: PlayPageProps) {
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

  // If participant is provided, redirect to game selection
  if (resolvedSearchParams.participant) {
    redirect(
      `/game/${id}/select?participant=${resolvedSearchParams.participant}`
    );
  }

  const teamsPromise = supabase
    .from("teams")
    .select("*")
    .eq("game_id", id)
    .order("score", { ascending: false });

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

  return (
    <StudentGameView
      game={game}
      participant={participant}
      teams={teams || []}
    />
  );
}
