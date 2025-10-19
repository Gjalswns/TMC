import { CentralizedQuestionsManager } from "@/components/centralized-questions-manager";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
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

      {/* 중앙집중식 문제 관리 컴포넌트 */}
      <CentralizedQuestionsManager />
    </div>
  );
}
