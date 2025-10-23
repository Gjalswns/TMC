"use client";

import type { Database } from "@/lib/supabase"
import { supabase } from "@/lib/supabase"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { Clock, Users, Hash, Trash2, Settings } from "lucide-react"
import { InteractiveCard } from "./interactive-card"
import { useToast } from "@/components/ui/use-toast"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type Game = Database["public"]["Tables"]["games"]["Row"]

interface GamesListProps {
  games: Game[]
}

export function GamesList({ games: initialGames }: GamesListProps) {
  const [games, setGames] = useState(initialGames);
  const [deletingGameId, setDeletingGameId] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const handleDeleteGame = async (gameId: string) => {
    try {
      setDeletingGameId(gameId);

      // 게임과 관련된 모든 데이터 삭제
      const { error } = await supabase
        .from('games')
        .delete()
        .eq('id', gameId);

      if (error) throw error;

      // 로컬 상태에서 게임 제거
      setGames(prev => prev.filter(game => game.id !== gameId));

      toast({
        title: "게임 삭제 완료",
        description: "게임이 성공적으로 삭제되었습니다."
      });

      // 페이지 새로고침
      router.refresh();
    } catch (error) {
      console.error('게임 삭제 실패:', error);
      toast({
        title: "삭제 실패",
        description: "게임 삭제에 실패했습니다.",
        variant: "destructive"
      });
    } finally {
      setDeletingGameId(null);
    }
  };
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
                variant={game.status === "waiting" ? "secondary" : game.status === "in_progress" ? "default" : "outline"}
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
                <span className="font-mono">{game.join_code}</span>
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
            
            <div className="flex gap-2">
              <Button asChild className="flex-1 interactive-hover group">
                <Link href={`/admin/game/${game.id}`}>
                  <Settings className="mr-2 h-4 w-4 group-hover:scale-110 transition-transform" />
                  Let's Go
                </Link>
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm"
                    disabled={deletingGameId === game.id}
                    className="px-3"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>게임을 삭제하시겠습니까?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{game.title}" 게임과 관련된 모든 데이터가 영구적으로 삭제됩니다. 
                      이 작업은 되돌릴 수 없습니다.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteGame(game.id)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </InteractiveCard>
      ))}
    </div>
  )
}
