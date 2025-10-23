"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"

const TEACHER_PASSWORD = "0824"
const AUTH_KEY = "teacher_authenticated"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // 세션 스토리지에서 인증 상태 확인
    const authenticated = sessionStorage.getItem(AUTH_KEY)
    if (authenticated === "true") {
      setIsAuthenticated(true)
    }
    setIsLoading(false)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password === TEACHER_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, "true")
      setIsAuthenticated(true)
      setError("")
    } else {
      setError("비밀번호가 올바르지 않습니다")
      setPassword("")
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background to-muted/20">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-2">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Teacher Access</CardTitle>
            <CardDescription>
              비밀번호를 입력하여 관리자 페이지에 접속하세요
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="password"
                  placeholder="비밀번호 입력"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="text-center text-lg tracking-widest"
                  autoFocus
                />
                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}
              </div>
              <Button type="submit" className="w-full" size="lg">
                접속하기
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => router.push("/join")}
              >
                돌아가기
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
