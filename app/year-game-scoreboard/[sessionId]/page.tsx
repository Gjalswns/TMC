import { YearGameTeamScoreboard } from '@/components/year-game-team-scoreboard'

export default function YearGameScoreboardPage({ params }: { params: { sessionId: string } }) {
  return <YearGameTeamScoreboard sessionId={params.sessionId} />
}
