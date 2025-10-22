import { CleanScoreboard } from '@/components/clean-scoreboard'

export default function DisplayPage({ params }: { params: { gameId: string } }) {
  return <CleanScoreboard gameId={params.gameId} />
}
