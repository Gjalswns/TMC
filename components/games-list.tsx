import type { Database } from "@/lib/supabase"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Clock, Users, Hash, Play } from "lucide-react"
import { InteractiveCard } from "./interactive-card"

type Game = Database["public"]["Tables"]["games"]["Row"]

interface GamesListProps {
  games: Game[]
}

export function GamesList({ games }: GamesListProps) {
  if (games.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8 space-y-2">
        <div className="w-16 h-16 bg-muted/20 rounded-full flex items-center justify-center mx-auto">
          <span className="text-2xl">🎮</span>
        </div>
        <p>No games created yet</p>
        <p className="text-xs">Create your first game above!</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {games.map((game, index) => (
        <InteractiveCard key={game.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg flex items-center justify-center">
                  <span className="text-xs font-bold">{index + 1}</span>
                </div>
                {game.title}
              </CardTitle>
              <Badge
                variant={game.status === "waiting" ? "secondary" : game.status === "started" ? "default" : "outline"}
                className="animate-pulse"
              >
                {game.status}
              </Badge>
            </div>
            <CardDescription>{game.grade_class}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Hash className="h-4 w-4" />
                <span className="font-mono">{game.game_code}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {game.duration}min
              </div>
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {game.team_count} teams
              </div>
            </div>
            <Button asChild className="w-full interactive-hover group">
              <Link href={`/admin/game/${game.id}`}>
                <Play className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                Manage Game
              </Link>
            </Button>
          </CardContent>
        </InteractiveCard>
      ))}
    </div>
  )
}
