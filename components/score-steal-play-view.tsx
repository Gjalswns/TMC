"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Target,
  Users,
  Trophy,
  AlertCircle,
  CheckCircle,
  XCircle,
  Sword,
} from "lucide-react";
import {
  submitScoreStealAttempt,
  getScoreStealQuestions,
  getAvailableTargets,
} from "@/lib/score-steal-actions";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/lib/supabase";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useScoreStealAttemptsUpdates } from "@/hooks/use-realtime";

interface ScoreStealQuestion {
  id: string;
  question_text: string;
  correct_answer: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
}

interface Team {
  id: string;
  team_name: string;
  team_number: number;
  score: number;
}

interface ScoreStealPlayViewProps {
  gameId: string;
  currentRound: number;
  teamId: string;
  participantId: string;
}

export function ScoreStealPlayView({
  gameId,
  currentRound,
  teamId,
  participantId,
}: ScoreStealPlayViewProps) {
  const [questions, setQuestions] = useState<ScoreStealQuestion[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [selectedQuestion, setSelectedQuestion] = useState<string>("");
  const [answer, setAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{
    isCorrect: boolean;
    pointsGained: number;
    pointsLost: number;
  } | null>(null);
  const { toast } = useToast();

  // Load questions and teams
  useEffect(() => {
    const loadData = async () => {
      const [questionsResult, teamsResult] = await Promise.all([
        getScoreStealQuestions(gameId, currentRound),
        getAvailableTargets(gameId),
      ]);

      if (questionsResult.success) {
        setQuestions(questionsResult.questions);
      }

      if (teamsResult.success) {
        // Filter out current team from targets
        const otherTeams = teamsResult.teams.filter(
          (team) => team.id !== teamId
        );
        setTeams(otherTeams);
      }
    };

    loadData();
  }, [gameId, teamId]);

  // Real-time updates for team scores
  const handleAttemptsUpdate = useCallback(
    (newAttempt: any) => {
      // Refresh teams data when new attempts are made
      const refreshTeams = async () => {
        const teamsResult = await getAvailableTargets(gameId);
        if (teamsResult.success) {
          const otherTeams = teamsResult.teams.filter(
            (team) => team.id !== teamId
          );
          setTeams(otherTeams);
        }
      };
      refreshTeams();
    },
    [gameId, teamId]
  );

  useScoreStealAttemptsUpdates(gameId, currentRound, handleAttemptsUpdate);

  const handleSubmitAnswer = async () => {
    if (!selectedTarget || !selectedQuestion || !answer.trim()) {
      toast({
        title: "Error",
        description:
          "Please select a target team, question, and provide an answer",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitScoreStealAttempt(
        gameId,
        currentRound,
        teamId,
        selectedQuestion,
        selectedTarget,
        answer.trim()
      );

      if (result.success) {
        setLastResult({
          isCorrect: result.isCorrect,
          pointsGained: result.pointsGained,
          pointsLost: result.pointsLost,
        });

        // Refresh teams data
        const teamsResult = await getAvailableTargets(gameId);
        if (teamsResult.success) {
          const otherTeams = teamsResult.teams.filter(
            (team) => team.id !== teamId
          );
          setTeams(otherTeams);
        }

        // Clear form
        setAnswer("");
        setSelectedQuestion("");
        setSelectedTarget("");

        toast({
          title: result.isCorrect ? "Correct!" : "Incorrect",
          description: result.isCorrect
            ? `You gained ${result.pointsGained} points!`
            : `You lost ${Math.abs(result.pointsGained)} points.`,
          variant: result.isCorrect ? "default" : "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to submit answer",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit answer",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedQuestionData = questions.find((q) => q.id === selectedQuestion);
  const selectedTargetData = teams.find((t) => t.id === selectedTarget);

  const sortedTeams = [...teams].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-6">
      {/* Game Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sword className="h-5 w-5" />
            Score Steal Game
          </CardTitle>
          <CardDescription>
            Round {currentRound} - Attack other teams to steal their points!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Target className="h-4 w-4" />
            <AlertDescription>
              Choose a target team and question. Answer correctly to steal
              points, but be careful - wrong answers will cost you points!
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Attack Form */}
      <Card>
        <CardHeader>
          <CardTitle>Launch Attack</CardTitle>
          <CardDescription>
            Select your target and question, then submit your answer
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="target">Target Team</Label>
              <Select value={selectedTarget} onValueChange={setSelectedTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a team to attack" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.team_name} ({team.score} points)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="question">Question</Label>
              <Select
                value={selectedQuestion}
                onValueChange={setSelectedQuestion}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a question" />
                </SelectTrigger>
                <SelectContent>
                  {questions.map((question) => (
                    <SelectItem key={question.id} value={question.id}>
                      {question.difficulty.toUpperCase()} - {question.points}{" "}
                      points
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedQuestionData && (
            <div className="p-4 bg-muted/50 rounded-lg">
              <h4 className="font-medium mb-2">Question:</h4>
              <p className="text-sm">{selectedQuestionData.question_text}</p>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline">
                  {selectedQuestionData.difficulty}
                </Badge>
                <Badge variant="secondary">
                  {selectedQuestionData.points} points
                </Badge>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="answer">Your Answer</Label>
            <Input
              id="answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Enter your answer..."
              onKeyPress={(e) => e.key === "Enter" && handleSubmitAnswer()}
            />
          </div>

          <Button
            onClick={handleSubmitAnswer}
            disabled={
              isSubmitting ||
              !selectedTarget ||
              !selectedQuestion ||
              !answer.trim()
            }
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Attack"}
          </Button>
        </CardContent>
      </Card>

      {/* Last Result */}
      {lastResult && (
        <Card>
          <CardContent className="pt-6">
            <div
              className={`flex items-center gap-3 p-4 rounded-lg ${
                lastResult.isCorrect
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              {lastResult.isCorrect ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <XCircle className="h-6 w-6 text-red-500" />
              )}
              <div>
                <h4 className="font-medium">
                  {lastResult.isCorrect
                    ? "Attack Successful!"
                    : "Attack Failed!"}
                </h4>
                <p className="text-sm text-muted-foreground">
                  {lastResult.isCorrect
                    ? `You gained ${lastResult.pointsGained} points!`
                    : `You lost ${Math.abs(lastResult.pointsGained)} points.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Scoreboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Live Scoreboard
          </CardTitle>
          <CardDescription>Current team rankings and scores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedTeams.map((team, index) => (
              <div
                key={team.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  index === 0 ? "bg-yellow-50 border-yellow-200" : "bg-muted/50"
                } ${team.id === selectedTarget ? "ring-2 ring-red-200" : ""}`}
              >
                <div className="flex items-center gap-3">
                  {index === 0 && (
                    <Trophy className="h-5 w-5 text-yellow-500" />
                  )}
                  <span className="font-medium text-lg">#{index + 1}</span>
                  <span className="font-medium">{team.team_name}</span>
                  {team.id === selectedTarget && (
                    <Badge variant="destructive">TARGET</Badge>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{team.score}</div>
                  <div className="text-sm text-muted-foreground">points</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Game Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Game Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <h4 className="font-medium">How to Play</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-1">
              <li>• Select a target team and choose a question</li>
              <li>• Answer correctly to steal points from the target team</li>
              <li>
                • Wrong answers will cost you points (half the question value)
              </li>
              <li>• Teams cannot go below 0 points</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Point Values</h4>
            <ul className="text-sm text-muted-foreground space-y-1 mt-1">
              <li>• Easy questions: 10 points (wrong = -5 points)</li>
              <li>• Medium questions: 20 points (wrong = -10 points)</li>
              <li>• Hard questions: 30 points (wrong = -15 points)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
