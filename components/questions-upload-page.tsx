"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  createScoreStealQuestion,
  createRelayQuizQuestion,
  getScoreStealQuestions,
  getRelayQuizQuestions,
} from "@/lib/game-actions";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Trash2,
  Edit,
  Save,
  X,
  ArrowLeft,
  Hash,
  Trophy,
  Clock,
} from "lucide-react";
import Link from "next/link";

interface ScoreStealQuestion {
  id?: string;
  questionText: string;
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  points: number;
  gameId: string;
  roundNumber: number;
}

interface RelayQuizQuestion {
  id?: string;
  questionText: string;
  correctAnswer: string;
  points: number;
  questionOrder: number;
  gameId: string;
  roundNumber: number;
}

export function QuestionsUploadPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedGameId, setSelectedGameId] = useState<string>("");
  const [selectedRound, setSelectedRound] = useState<number>(2);
  const [isLoading, setIsLoading] = useState(false);

  // Score Steal Questions
  const [scoreStealQuestions, setScoreStealQuestions] = useState<ScoreStealQuestion[]>([]);
  const [newScoreStealQuestion, setNewScoreStealQuestion] = useState<ScoreStealQuestion>({
    questionText: "",
    correctAnswer: "",
    difficulty: "easy",
    points: 10,
    gameId: "",
    roundNumber: 2,
  });
  const [editingScoreStealId, setEditingScoreStealId] = useState<string | null>(null);

  // Relay Quiz Questions
  const [relayQuizQuestions, setRelayQuizQuestions] = useState<RelayQuizQuestion[]>([]);
  const [newRelayQuizQuestion, setNewRelayQuizQuestion] = useState<RelayQuizQuestion>({
    questionText: "",
    correctAnswer: "",
    points: 10,
    questionOrder: 1,
    gameId: "",
    roundNumber: 3,
  });
  const [editingRelayQuizId, setEditingRelayQuizId] = useState<string | null>(null);

  // Games data from database
  const [games, setGames] = useState<Array<{ id: string; title: string; game_type: string }>>([]);

  // Load games from database
  useEffect(() => {
    const loadGames = async () => {
      try {
        const { data, error } = await supabase
          .from("games")
          .select("id, title, game_type")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setGames(data || []);
      } catch (error) {
        console.error("Error loading games:", error);
        toast({
          title: "Error",
          description: "Failed to load games",
          variant: "destructive",
        });
      }
    };

    loadGames();
  }, []);

  // Load questions when game or round changes
  useEffect(() => {
    if (selectedGameId) {
      loadQuestions();
    }
  }, [selectedGameId, selectedRound]);

  const loadQuestions = async () => {
    if (!selectedGameId) return;

    setIsLoading(true);
    try {
      // Load Score Steal questions
      const scoreStealResult = await getScoreStealQuestions(selectedGameId, selectedRound);
      if (scoreStealResult.success) {
        setScoreStealQuestions(scoreStealResult.questions || []);
      }

      // Load Relay Quiz questions
      const relayQuizResult = await getRelayQuizQuestions(selectedGameId, selectedRound);
      if (relayQuizResult.success) {
        setRelayQuizQuestions(relayQuizResult.questions || []);
      }
    } catch (error) {
      console.error("Error loading questions:", error);
      toast({
        title: "Error",
        description: "Failed to load questions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateScoreStealQuestion = async () => {
    if (!selectedGameId || !newScoreStealQuestion.questionText || !newScoreStealQuestion.correctAnswer) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await createScoreStealQuestion(
        selectedGameId,
        selectedRound,
        newScoreStealQuestion.questionText,
        newScoreStealQuestion.correctAnswer,
        newScoreStealQuestion.difficulty
      );

      if (result.success) {
        toast({
          title: "Success",
          description: "Score Steal question created successfully",
        });
        setNewScoreStealQuestion({
          questionText: "",
          correctAnswer: "",
          difficulty: "easy",
          points: 10,
          gameId: selectedGameId,
          roundNumber: selectedRound,
        });
        loadQuestions();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create question",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create question",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateRelayQuizQuestion = async () => {
    if (!selectedGameId || !newRelayQuizQuestion.questionText || !newRelayQuizQuestion.correctAnswer) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await createRelayQuizQuestion(
        selectedGameId,
        selectedRound,
        newRelayQuizQuestion.questionOrder,
        newRelayQuizQuestion.questionText,
        newRelayQuizQuestion.correctAnswer,
        newRelayQuizQuestion.points
      );

      if (result.success) {
        toast({
          title: "Success",
          description: "Relay Quiz question created successfully",
        });
        setNewRelayQuizQuestion({
          questionText: "",
          correctAnswer: "",
          points: 10,
          questionOrder: newRelayQuizQuestion.questionOrder + 1,
          gameId: selectedGameId,
          roundNumber: selectedRound,
        });
        loadQuestions();
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create question",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create question",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "easy": return "bg-green-100 text-green-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "hard": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const handleDeleteScoreStealQuestion = async (questionId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("score_steal_questions")
        .delete()
        .eq("id", questionId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Question deleted successfully",
      });
      loadQuestions();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete question",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteRelayQuizQuestion = async (questionId: string) => {
    if (!confirm("Are you sure you want to delete this question?")) return;

    setIsLoading(true);
    try {
      const { error } = await supabase
        .from("relay_quiz_questions")
        .delete()
        .eq("id", questionId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Question deleted successfully",
      });
      loadQuestions();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete question",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Admin
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Questions Management</h1>
            <p className="text-muted-foreground">Upload and manage game questions</p>
          </div>
        </div>
      </div>

      {/* Game and Round Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Hash className="h-5 w-5" />
            Game & Round Selection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="game-select">Select Game</Label>
              <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a game" />
                </SelectTrigger>
                <SelectContent>
                  {games.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.title} ({game.game_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="round-select">Select Round</Label>
              <Select value={selectedRound.toString()} onValueChange={(value) => setSelectedRound(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a round" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">Round 2 (Score Steal)</SelectItem>
                  <SelectItem value="3">Round 3 (Relay Quiz)</SelectItem>
                  <SelectItem value="4">Round 4 (Relay Quiz)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedGameId && (
        <Tabs defaultValue="score-steal" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="score-steal" className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              Score Steal Questions
            </TabsTrigger>
            <TabsTrigger value="relay-quiz" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Relay Quiz Questions
            </TabsTrigger>
          </TabsList>

          {/* Score Steal Questions Tab */}
          <TabsContent value="score-steal" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Add New Score Steal Question
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="score-steal-question">Question Text</Label>
                  <Textarea
                    id="score-steal-question"
                    value={newScoreStealQuestion.questionText}
                    onChange={(e) =>
                      setNewScoreStealQuestion({
                        ...newScoreStealQuestion,
                        questionText: e.target.value,
                      })
                    }
                    placeholder="Enter the question..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="score-steal-answer">Correct Answer</Label>
                  <Input
                    id="score-steal-answer"
                    value={newScoreStealQuestion.correctAnswer}
                    onChange={(e) =>
                      setNewScoreStealQuestion({
                        ...newScoreStealQuestion,
                        correctAnswer: e.target.value,
                      })
                    }
                    placeholder="Enter the correct answer..."
                  />
                </div>
                <div>
                  <Label htmlFor="score-steal-difficulty">Difficulty</Label>
                  <Select
                    value={newScoreStealQuestion.difficulty}
                    onValueChange={(value: "easy" | "medium" | "hard") =>
                      setNewScoreStealQuestion({
                        ...newScoreStealQuestion,
                        difficulty: value,
                        points: value === "easy" ? 10 : value === "medium" ? 20 : 30,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy (10 points)</SelectItem>
                      <SelectItem value="medium">Medium (20 points)</SelectItem>
                      <SelectItem value="hard">Hard (30 points)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateScoreStealQuestion} disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Question"}
                </Button>
              </CardContent>
            </Card>

            {/* Score Steal Questions List */}
            <Card>
              <CardHeader>
                <CardTitle>Score Steal Questions ({scoreStealQuestions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {scoreStealQuestions.map((question, index) => (
                    <div key={question.id || index} className="p-4 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-medium">{question.questionText}</p>
                          <p className="text-sm text-muted-foreground">
                            Answer: {question.correctAnswer}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getDifficultyColor(question.difficulty)}>
                            {question.difficulty}
                          </Badge>
                          <Badge variant="secondary">{question.points} pts</Badge>
                          {question.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteScoreStealQuestion(question.id!)}
                              disabled={isLoading}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {scoreStealQuestions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No Score Steal questions yet. Create your first question above.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Relay Quiz Questions Tab */}
          <TabsContent value="relay-quiz" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Add New Relay Quiz Question
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="relay-question-order">Question Order</Label>
                  <Input
                    id="relay-question-order"
                    type="number"
                    value={newRelayQuizQuestion.questionOrder}
                    onChange={(e) =>
                      setNewRelayQuizQuestion({
                        ...newRelayQuizQuestion,
                        questionOrder: parseInt(e.target.value) || 1,
                      })
                    }
                    min="1"
                  />
                </div>
                <div>
                  <Label htmlFor="relay-question">Question Text</Label>
                  <Textarea
                    id="relay-question"
                    value={newRelayQuizQuestion.questionText}
                    onChange={(e) =>
                      setNewRelayQuizQuestion({
                        ...newRelayQuizQuestion,
                        questionText: e.target.value,
                      })
                    }
                    placeholder="Enter the question (include the previous answer in the question)..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="relay-answer">Correct Answer</Label>
                  <Input
                    id="relay-answer"
                    value={newRelayQuizQuestion.correctAnswer}
                    onChange={(e) =>
                      setNewRelayQuizQuestion({
                        ...newRelayQuizQuestion,
                        correctAnswer: e.target.value,
                      })
                    }
                    placeholder="This answer will be used in the next question..."
                  />
                </div>
                <div>
                  <Label htmlFor="relay-points">Points</Label>
                  <Input
                    id="relay-points"
                    type="number"
                    value={newRelayQuizQuestion.points}
                    onChange={(e) =>
                      setNewRelayQuizQuestion({
                        ...newRelayQuizQuestion,
                        points: parseInt(e.target.value) || 10,
                      })
                    }
                    min="1"
                  />
                </div>
                <Button onClick={handleCreateRelayQuizQuestion} disabled={isLoading}>
                  {isLoading ? "Creating..." : "Create Question"}
                </Button>
              </CardContent>
            </Card>

            {/* Relay Quiz Questions List */}
            <Card>
              <CardHeader>
                <CardTitle>Relay Quiz Questions ({relayQuizQuestions.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {relayQuizQuestions
                    .sort((a, b) => a.questionOrder - b.questionOrder)
                    .map((question, index) => (
                      <div key={question.id || index} className="p-4 border rounded-lg space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">#{question.questionOrder}</Badge>
                              <Badge variant="secondary">{question.points} pts</Badge>
                            </div>
                            <p className="font-medium">{question.questionText}</p>
                            <p className="text-sm text-muted-foreground">
                              Answer: {question.correctAnswer}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {question.id && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteRelayQuizQuestion(question.id!)}
                                disabled={isLoading}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  {relayQuizQuestions.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No Relay Quiz questions yet. Create your first question above.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {!selectedGameId && (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-muted-foreground">
              Please select a game and round to start managing questions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
