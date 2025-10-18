"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { joinGame } from "@/lib/game-actions";
import { Users, Clock, AlertCircle } from "lucide-react";

export default function JoinGameWithCode({
  game,
}: {
  game: { 
    id: string; 
    title: string; 
    max_participants?: number;
    currentParticipants?: number;
    remainingSlots?: number;
    isJoinable?: boolean;
    status?: string;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [nickname, setNickname] = useState("");
  const [studentId, setStudentId] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleJoin = async () => {
    if (!nickname.trim()) {
      toast({
        title: "오류",
        description: "닉네임을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (nickname.trim().length < 2 || nickname.trim().length > 20) {
      toast({
        title: "닉네임 길이 오류",
        description: "닉네임은 2-20자 사이여야 합니다.",
        variant: "destructive",
      });
      return;
    }

    if (studentId && (studentId.length < 3 || studentId.length > 20)) {
      toast({
        title: "학생 ID 길이 오류",
        description: "학생 ID는 3-20자 사이여야 합니다.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const result = await joinGame(game.id, nickname.trim(), studentId.trim() || undefined);

      if (result.success) {
        // Store participant info and navigate to waiting room
        sessionStorage.setItem(
          `participant-${game.id}`,
          JSON.stringify({ id: result.participantId, nickname: nickname.trim() })
        );

        // Show success message
        toast({
          title: "게임 참가 성공!",
          description: `대기실로 이동합니다. (${result.participantCount}/${game.max_participants || 20}명 참가)`,
        });

        router.push(`/game/${game.id}/wait?participant=${result.participantId}`);
      } else {
        toast({
          title: "게임 참가 실패",
          description: result.error || "게임 참가에 실패했습니다.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Unexpected error during join:", error);
      toast({
        title: "오류",
        description: "예상치 못한 오류가 발생했습니다. 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Check if game is joinable
  const canJoin = game.isJoinable !== false && game.status === "waiting";

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">게임 참가</CardTitle>
          <p className="text-xl font-semibold text-primary">{game.title}</p>
          
          {/* Game Status */}
          <div className="flex items-center justify-center gap-4 mt-2">
            <Badge variant={game.status === "waiting" ? "default" : "secondary"}>
              {game.status === "waiting" ? "참가 가능" : "참가 불가"}
            </Badge>
            {game.currentParticipants !== undefined && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                {game.currentParticipants}/{game.max_participants || 20}명
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!canJoin ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {game.status !== "waiting" 
                  ? "게임이 이미 시작되었거나 종료되었습니다."
                  : "게임 참가가 불가능합니다."
                }
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nickname">닉네임 *</Label>
                <Input
                  id="nickname"
                  placeholder="닉네임을 입력하세요 (2-20자)"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="text-center"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground text-center">
                  {nickname.length}/20자
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="studentId">학생 ID (선택사항)</Label>
                <Input
                  id="studentId"
                  placeholder="학생 ID를 입력하세요 (3-20자)"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="text-center"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground text-center">
                  {studentId.length}/20자
                </p>
              </div>

              {game.remainingSlots !== undefined && game.remainingSlots <= 5 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    남은 자리: {game.remainingSlots}개
                  </AlertDescription>
                </Alert>
              )}

              <Button 
                onClick={handleJoin} 
                className="w-full"
                disabled={isLoading || !nickname.trim()}
              >
                {isLoading ? "참가 중..." : "Let's Go!"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
