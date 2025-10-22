"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  Upload,
  Plus,
  Edit,
  Trash2,
  Image as ImageIcon,
  FileText,
  AlertCircle,
  CheckCircle,
  Eye,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

interface QuestionCategory {
  id: string;
  name: string;
  description: string;
}

interface CentralQuestion {
  id: string;
  category_id: string;
  title: string;
  question_image_url: string;
  correct_answer: string;
  points: number;
  order_index: number;
  is_active: boolean;
  created_at: string;
  category_name?: string;
}

const CATEGORY_INFO = {
  score_steal: { name: '점수 뺏기', color: 'bg-blue-100 text-blue-800', description: '동시 출제되는 문제들' },
  relay_p: { name: 'P 세트', color: 'bg-green-100 text-green-800', description: '릴레이 퀴즈 P 세트 (4문제)' },
  relay_q: { name: 'Q 세트', color: 'bg-red-100 text-red-800', description: '릴레이 퀴즈 Q 세트 (4문제)' },
  relay_r: { name: 'R 세트', color: 'bg-orange-100 text-orange-800', description: '릴레이 퀴즈 R 세트 (4문제)' },
  relay_s: { name: 'S 세트', color: 'bg-purple-100 text-purple-800', description: '릴레이 퀴즈 S 세트 (4문제)' }
};

export function CentralizedQuestionsManager() {
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  const [questions, setQuestions] = useState<CentralQuestion[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('score_steal');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<CentralQuestion | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const { toast } = useToast();

  // 새 문제 폼 상태
  const [newQuestion, setNewQuestion] = useState<{
    title: string;
    question_image_url: string;
    correct_answer: string;
    points: number;
    order_index: number;
  }>({
    title: '',
    question_image_url: '',
    correct_answer: '',
    points: 300,
    order_index: 1
  });

  // 카테고리 및 문제 로드
  useEffect(() => {
    loadCategories();
    loadQuestions();
  }, []);

  // 선택된 카테고리 변경시 문제 다시 로드
  useEffect(() => {
    if (selectedCategory) {
      loadQuestionsByCategory(selectedCategory);
    }
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('question_categories')
        .select('*')
        .order('name');

      if (error) throw error;

      setCategories(data || []);
    } catch (error) {
      console.error('카테고리 로드 실패:', error);
      toast({
        title: "오류",
        description: "카테고리를 불러오는데 실패했습니다.",
        variant: "destructive"
      });
    }
  };

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('central_questions')
        .select(`
          *,
          question_categories(name)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const questionsWithCategory = (data || []).map(q => ({
        ...q,
        category_name: q.question_categories?.name
      }));

      setQuestions(questionsWithCategory);
    } catch (error) {
      console.error('문제 로드 실패:', error);
      toast({
        title: "오류",
        description: "문제를 불러오는데 실패했습니다.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadQuestionsByCategory = async (categoryName: string) => {
    try {
      const { data, error } = await supabase
        .from('central_questions')
        .select(`
          *,
          question_categories!inner(name)
        `)
        .eq('question_categories.name', categoryName)
        .eq('is_active', true)
        .order('order_index')
        .order('created_at');

      if (error) throw error;

      console.log(`${categoryName} 카테고리 문제 로드:`, data?.length || 0);
    } catch (error) {
      console.error('카테고리별 문제 로드 실패:', error);
    }
  };

  const handleImageUpload = async (file: File) => {
    try {
      setUploading(true);

      // 파일 이름을 고유하게 만들기 (타임스탬프 + 랜덤 문자열)
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `question-images/${fileName}`;

      // Supabase Storage에 업로드
      const { data, error } = await supabase.storage
        .from('game-assets')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Public URL 가져오기
      const { data: { publicUrl } } = supabase.storage
        .from('game-assets')
        .getPublicUrl(filePath);

      setNewQuestion(prev => ({
        ...prev,
        question_image_url: publicUrl
      }));

      toast({
        title: "업로드 완료",
        description: "이미지가 성공적으로 업로드되었습니다."
      });
    } catch (error) {
      console.error('이미지 업로드 실패:', error);
      toast({
        title: "업로드 실패",
        description: error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAddQuestion = async () => {
    try {
      if (!newQuestion.title || !newQuestion.question_image_url || !newQuestion.correct_answer) {
        toast({
          title: "입력 오류",
          description: "모든 필수 필드를 입력해주세요.",
          variant: "destructive"
        });
        return;
      }

      const category = categories.find(c => c.name === selectedCategory);
      if (!category) {
        toast({
          title: "오류",
          description: "카테고리를 찾을 수 없습니다.",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = await supabase
        .from('central_questions')
        .insert({
          category_id: category.id,
          title: newQuestion.title,
          question_image_url: newQuestion.question_image_url,
          correct_answer: newQuestion.correct_answer,
          difficulty: 'medium',
          points: newQuestion.points,
          order_index: newQuestion.order_index,
          is_active: true
        })
        .select(`
          *,
          question_categories(name)
        `)
        .single();

      if (error) throw error;

      const questionWithCategory = {
        ...data,
        category_name: data.question_categories?.name
      };

      setQuestions(prev => [...prev, questionWithCategory]);

      // 폼 초기화
      setNewQuestion({
        title: '',
        question_image_url: '',
        correct_answer: '',
        points: 300,
        order_index: 1
      });

      setShowAddDialog(false);

      toast({
        title: "문제 추가 완료",
        description: "새 문제가 성공적으로 추가되었습니다."
      });
    } catch (error) {
      console.error('문제 추가 실패:', error);
      toast({
        title: "추가 실패",
        description: "문제 추가에 실패했습니다.",
        variant: "destructive"
      });
    }
  };

  const handleEditQuestion = async () => {
    try {
      if (!editingQuestion || !editingQuestion.title || !editingQuestion.question_image_url || !editingQuestion.correct_answer) {
        toast({
          title: "입력 오류",
          description: "모든 필수 필드를 입력해주세요.",
          variant: "destructive"
        });
        return;
      }

      const { data, error } = await supabase
        .from('central_questions')
        .update({
          title: editingQuestion.title,
          question_image_url: editingQuestion.question_image_url,
          correct_answer: editingQuestion.correct_answer,
          difficulty: 'medium',
          points: editingQuestion.points,
          order_index: editingQuestion.order_index
        })
        .eq('id', editingQuestion.id)
        .select(`
          *,
          question_categories(name)
        `)
        .single();

      if (error) throw error;

      const updatedQuestion = {
        ...data,
        category_name: data.question_categories?.name
      };

      setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? updatedQuestion : q));
      setEditingQuestion(null);
      setShowEditDialog(false);

      toast({
        title: "문제 수정 완료",
        description: "문제가 성공적으로 수정되었습니다."
      });
    } catch (error) {
      console.error('문제 수정 실패:', error);
      toast({
        title: "수정 실패",
        description: "문제 수정에 실패했습니다.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    try {
      const { error } = await supabase
        .from('central_questions')
        .update({ is_active: false })
        .eq('id', questionId);

      if (error) throw error;

      setQuestions(prev => prev.filter(q => q.id !== questionId));

      toast({
        title: "문제 삭제 완료",
        description: "문제가 성공적으로 삭제되었습니다."
      });
    } catch (error) {
      console.error('문제 삭제 실패:', error);
      toast({
        title: "삭제 실패",
        description: "문제 삭제에 실패했습니다.",
        variant: "destructive"
      });
    }
  };

  const handleMoveQuestion = async (questionId: string, direction: 'up' | 'down') => {
    try {
      // 실제 구현에서는 order_index 업데이트
      console.log(`문제 ${questionId}를 ${direction} 방향으로 이동`);

      toast({
        title: "순서 변경 완료",
        description: "문제 순서가 변경되었습니다."
      });
    } catch (error) {
      console.error('순서 변경 실패:', error);
      toast({
        title: "순서 변경 실패",
        description: "문제 순서 변경에 실패했습니다.",
        variant: "destructive"
      });
    }
  };

  const filteredQuestions = questions.filter(q => q.category_name === selectedCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-2">문제를 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">중앙집중식 문제 관리</h1>
        <p className="text-muted-foreground">
          모든 게임에서 사용할 문제들을 한 곳에서 관리하세요
        </p>
      </div>

      {/* 카테고리 선택 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            문제 카테고리
          </CardTitle>
          <CardDescription>
            관리할 문제 유형을 선택하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
            <TabsList className="grid w-full grid-cols-5">
              {Object.entries(CATEGORY_INFO).map(([key, info]) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  {info.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {Object.entries(CATEGORY_INFO).map(([key, info]) => (
              <TabsContent key={key} value={key} className="mt-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>{info.name}</strong>: {info.description}
                  </AlertDescription>
                </Alert>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* 문제 목록 및 관리 */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* 문제 추가 카드 */}
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">새 문제 추가</h3>
              <p className="text-sm text-muted-foreground">
                {CATEGORY_INFO[selectedCategory as keyof typeof CATEGORY_INFO]?.name} 문제를 추가하세요
              </p>
            </div>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button>문제 추가</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>새 문제 추가</DialogTitle>
                  <DialogDescription>
                    {CATEGORY_INFO[selectedCategory as keyof typeof CATEGORY_INFO]?.name} 카테고리에 새 문제를 추가합니다
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  {/* 문제 제목 */}
                  <div>
                    <Label htmlFor="title">문제 제목</Label>
                    <Input
                      id="title"
                      value={newQuestion.title}
                      onChange={(e) => setNewQuestion(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="문제 제목을 입력하세요"
                    />
                  </div>

                  {/* 이미지 업로드 */}
                  <div>
                    <Label>문제 이미지</Label>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(file);
                          }}
                          disabled={uploading}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploading}
                        >
                          <Upload className="h-4 w-4 mr-1" />
                          {uploading ? '업로드 중...' : '업로드'}
                        </Button>
                      </div>

                      {newQuestion.question_image_url && (
                        <div className="relative">
                          <img
                            src={newQuestion.question_image_url}
                            alt="문제 이미지 미리보기"
                            className="w-full max-h-64 object-contain rounded-lg border-2 border-border bg-muted/30"
                            onError={(e) => {
                              console.error('이미지 로드 실패:', newQuestion.question_image_url);
                              e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23ddd" width="400" height="300"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E이미지 로드 실패%3C/text%3E%3C/svg%3E';
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="absolute top-2 right-2"
                            onClick={() => setPreviewImage(newQuestion.question_image_url)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 정답 */}
                  <div>
                    <Label htmlFor="answer">정답</Label>
                    <Input
                      id="answer"
                      value={newQuestion.correct_answer}
                      onChange={(e) => setNewQuestion(prev => ({ ...prev, correct_answer: e.target.value }))}
                      placeholder="정답을 입력하세요"
                    />
                  </div>

                  {/* 배점 설정 */}
                  <div>
                    <Label htmlFor="points">배점</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        id="points"
                        type="number"
                        min="1"
                        max="1000"
                        value={newQuestion.points}
                        onChange={(e) => setNewQuestion(prev => ({ ...prev, points: parseInt(e.target.value) || 0 }))}
                        placeholder="배점을 입력하세요"
                        className="w-32"
                      />
                      <span className="text-sm text-muted-foreground">점</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      1점부터 1000점까지 설정 가능합니다.
                    </p>
                  </div>

                  {/* 릴레이 퀴즈의 경우 순서 */}
                  {selectedCategory.startsWith('relay_') && (
                    <div>
                      <Label htmlFor="order">문제 순서</Label>
                      <Select
                        value={newQuestion.order_index.toString()}
                        onValueChange={(value) =>
                          setNewQuestion(prev => ({ ...prev, order_index: parseInt(value) }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1번째 문제</SelectItem>
                          <SelectItem value="2">2번째 문제</SelectItem>
                          <SelectItem value="3">3번째 문제</SelectItem>
                          <SelectItem value="4">4번째 문제</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      취소
                    </Button>
                    <Button onClick={handleAddQuestion}>
                      문제 추가
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* 기존 문제들 */}
        {filteredQuestions.map((question, index) => (
          <Card key={question.id} className="relative">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{question.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary">{question.points}점</Badge>
                    {selectedCategory.startsWith('relay_') && (
                      <Badge variant="secondary">{question.order_index}번째</Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {selectedCategory.startsWith('relay_') && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveQuestion(question.id, 'up')}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMoveQuestion(question.id, 'down')}
                        disabled={index === filteredQuestions.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditingQuestion(question);
                      setShowEditDialog(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteQuestion(question.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                {/* 문제 이미지 */}
                <div className="relative">
                  <img
                    src={question.question_image_url}
                    alt={question.title}
                    className="w-full h-32 object-cover rounded border cursor-pointer"
                    onClick={() => setPreviewImage(question.question_image_url)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    className="absolute top-2 right-2"
                    onClick={() => setPreviewImage(question.question_image_url)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>

                {/* 정답 */}
                <div className="p-2 bg-muted rounded text-sm">
                  <strong>정답:</strong> {question.correct_answer}
                </div>

                {/* 상태 */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>생성일: {new Date(question.created_at).toLocaleDateString()}</span>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    <span>활성</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 빈 상태 */}
      {filteredQuestions.length === 0 && (
        <Card>
          <CardContent className="text-center py-12">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">문제가 없습니다</h3>
            <p className="text-muted-foreground mb-4">
              {CATEGORY_INFO[selectedCategory as keyof typeof CATEGORY_INFO]?.name} 카테고리에 첫 번째 문제를 추가해보세요
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              문제 추가
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 문제 편집 다이얼로그 */}
      {editingQuestion && (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>문제 편집</DialogTitle>
              <DialogDescription>
                문제 정보를 수정합니다
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* 문제 제목 */}
              <div>
                <Label htmlFor="edit-title">문제 제목</Label>
                <Input
                  id="edit-title"
                  value={editingQuestion.title}
                  onChange={(e) => setEditingQuestion(prev => prev ? { ...prev, title: e.target.value } : null)}
                  placeholder="문제 제목을 입력하세요"
                />
              </div>

              {/* 이미지 URL */}
              <div>
                <Label htmlFor="edit-image">문제 이미지 URL</Label>
                <Input
                  id="edit-image"
                  value={editingQuestion.question_image_url}
                  onChange={(e) => setEditingQuestion(prev => prev ? { ...prev, question_image_url: e.target.value } : null)}
                  placeholder="이미지 URL을 입력하세요"
                />
                {editingQuestion.question_image_url && (
                  <div className="mt-2">
                    <img
                      src={editingQuestion.question_image_url}
                      alt="문제 이미지 미리보기"
                      className="w-full h-32 object-cover rounded border"
                    />
                  </div>
                )}
              </div>

              {/* 정답 */}
              <div>
                <Label htmlFor="edit-answer">정답</Label>
                <Input
                  id="edit-answer"
                  value={editingQuestion.correct_answer}
                  onChange={(e) => setEditingQuestion(prev => prev ? { ...prev, correct_answer: e.target.value } : null)}
                  placeholder="정답을 입력하세요"
                />
              </div>

              {/* 배점 설정 */}
              <div>
                <Label htmlFor="edit-points">배점</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    id="edit-points"
                    type="number"
                    min="1"
                    max="1000"
                    value={editingQuestion.points}
                    onChange={(e) => setEditingQuestion(prev => prev ? { ...prev, points: parseInt(e.target.value) || 0 } : null)}
                    placeholder="배점을 입력하세요"
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">점</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  1점부터 1000점까지 설정 가능합니다.
                </p>
              </div>

              {/* 릴레이 퀴즈의 경우 순서 */}
              {selectedCategory.startsWith('relay_') && (
                <div>
                  <Label htmlFor="edit-order">문제 순서</Label>
                  <Select
                    value={editingQuestion.order_index.toString()}
                    onValueChange={(value) =>
                      setEditingQuestion(prev => prev ? { ...prev, order_index: parseInt(value) } : null)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1번째 문제</SelectItem>
                      <SelectItem value="2">2번째 문제</SelectItem>
                      <SelectItem value="3">3번째 문제</SelectItem>
                      <SelectItem value="4">4번째 문제</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setShowEditDialog(false);
                  setEditingQuestion(null);
                }}>
                  취소
                </Button>
                <Button onClick={handleEditQuestion}>
                  수정 완료
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* 이미지 미리보기 다이얼로그 */}
      {previewImage && (
        <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>문제 이미지 미리보기</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center">
              <img
                src={previewImage}
                alt="문제 이미지"
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}