import { supabase } from "@/lib/supabase"
import { CreateGameForm } from "@/components/create-game-form"
import { GamesList } from "@/components/games-list"
import { SupabaseConfigWarning } from "@/components/supabase-config-warning"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ArrowLeft, GraduationCap } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"

export default async function AdminPage() {
  // Try to fetch games, but handle the case where Supabase isn't configured
  let games = []
  let hasSupabaseError = false

  try {
    const { data, error } = await supabase.from("games").select("*").order("created_at", { ascending: false })
    if (error && error.message.includes("Supabase not configured")) {
      hasSupabaseError = true
    } else {
      games = data || []
    }
  } catch (error) {
    hasSupabaseError = true
  }

  return (
    <div className="container mx-auto p-6 space-y-8 relative">
      {/* Theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <div className="text-center flex-1">
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center">
              <GraduationCap className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold text-primary">
              Teacher Dashboard
            </h1>
          </div>
          <p className="text-muted-foreground">Create and manage classroom games</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/participants">
              참가자 관리
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/join">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Join
            </Link>
          </Button>
        </div>
      </div>

      {hasSupabaseError && (
        <div>
          <SupabaseConfigWarning />
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                <span className="text-primary font-bold">+</span>
              </div>
              Create New Game
            </CardTitle>
            <CardDescription>Set up a new game for your students</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasSupabaseError ? (
              <CreateGameForm />
            ) : (
              <div className="text-center text-muted-foreground py-8">Configure Supabase to create games</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 bg-secondary/20 rounded-lg flex items-center justify-center">
                <span className="text-secondary-foreground font-bold">📋</span>
              </div>
              Recent Games
            </CardTitle>
            <CardDescription>Manage your existing games</CardDescription>
          </CardHeader>
          <CardContent>
            {!hasSupabaseError ? (
              <GamesList games={games} />
            ) : (
              <div className="text-center text-muted-foreground py-8">Configure Supabase to view games</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 bg-accent/20 rounded-lg flex items-center justify-center">
                <span className="text-accent-foreground font-bold">❓</span>
              </div>
              Questions Management
            </CardTitle>
            <CardDescription>Upload and manage game questions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Create Score Steal and Relay Quiz questions for your games
              </p>
              <Button asChild className="w-full">
                <Link href="/admin/questions">
                  Manage Questions
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Access Instructions */}
      <Card>
        <CardContent className="p-4">
          <div className="text-center space-y-2">
            <h3 className="font-medium text-primary">💡 Quick Access Tip</h3>
            <p className="text-sm text-muted-foreground">
              Bookmark this page for quick access to teacher features. Students will automatically see the join game
              screen when they visit your site.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
