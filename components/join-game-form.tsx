"use client"

import { useState } from "react"
import type { Database } from "@/lib/supabase"
import { joinGame } from "@/lib/game-actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { Loader2, Users, Clock, Hash } from "lucide-react"

type Game = Database["public"]["Tables"]["games"]["Row"]

interface JoinGameFormProps {
  game: Game
}

export function JoinGameForm({ game }: JoinGameFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError("")

    try {
      const nickname = formData.get("nickname") as string
      const studentId = formData.get("studentId") as string

      const result = await joinGame(game.game_code, nickname, studentId || undefined)

      if (result.success) {
        router.push(`/game/${result.gameId}/wait?participant=${result.participantId}`)
      } else {
        setError(result.error || "Failed to join game")
      }
    } catch (error) {
      setError("Failed to join game")
    } finally {
      setIsLoading(false)
    }
  }

  if (game.status !== "waiting") {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Game Unavailable</CardTitle>
          <CardDescription>This game has already started or finished</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="outline" className="w-full justify-center py-2">
            Status: {game.status}
          </Badge>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Join Game</CardTitle>
        <CardDescription>{game.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Game Info */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-1">
            <Hash className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">{game.game_code}</p>
            <p className="text-xs text-muted-foreground">Code</p>
          </div>
          <div className="space-y-1">
            <Clock className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">{game.duration}min</p>
            <p className="text-xs text-muted-foreground">Duration</p>
          </div>
          <div className="space-y-1">
            <Users className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">{game.team_count}</p>
            <p className="text-xs text-muted-foreground">Teams</p>
          </div>
        </div>

        <div className="text-center">
          <Badge variant="secondary">{game.grade_class}</Badge>
        </div>

        {/* Join Form */}
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nickname">Nickname *</Label>
            <Input id="nickname" name="nickname" placeholder="Enter your nickname" required maxLength={50} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="studentId">Student ID (optional)</Label>
            <Input id="studentId" name="studentId" placeholder="Enter your student ID" maxLength={20} />
          </div>

          {error && <div className="text-sm text-red-600 text-center">{error}</div>}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Join Game
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
