import { BracketScoreboard } from '@/components/bracket-scoreboard'

export default function ScoreboardPage({ params }: { params: { gameId: string } }) {
  return <BracketScoreboard gameId={params.gameId} />
}
