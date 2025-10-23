import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function AdminQuestionsPage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 뒤로가기 버튼 */}
      <div className="flex items-center justify-between">
        <Button asChild variant="outline">
          <Link href="/admin">
            <ArrowLeft className="h-4 w-4 mr-2" />
            관리자 대시보드로 돌아가기
          </Link>
        </Button>
      </div>

      {/* 안내 메시지 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            문제 관리 기능 제거됨
          </CardTitle>
          <CardDescription>
            Year Game만 사용하므로 중앙 문제 관리 기능이 제거되었습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Year Game은 숫자 계산 게임으로, 별도의 문제 등록이 필요하지 않습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
