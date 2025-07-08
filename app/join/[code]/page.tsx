import { supabase } from "@/lib/supabase"
import { JoinGameForm } from "@/components/join-game-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface JoinPageProps {
  params: {
    code: string
  }
}

export default async function JoinPage({ params }: JoinPageProps) {
  const { data: game } = await supabase.from("games").select("*").eq("game_code", params.code.toUpperCase()).single()

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-red-900">Game Not Found</h1>
          <p className="text-red-700">The game code "{params.code.toUpperCase()}" is not valid.</p>
          <Button asChild>
            <Link href="/join">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Try Another Code
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center">
          <Button asChild variant="outline" size="sm">
            <Link href="/join">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
        <JoinGameForm game={game} />
      </div>
    </div>
  )
}
