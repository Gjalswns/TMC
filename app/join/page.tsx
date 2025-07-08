"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Hash, Loader2, Settings, Sparkles } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { InteractiveCard } from "@/components/interactive-card"

export default function JoinPage() {
  const [gameCode, setGameCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!gameCode.trim()) return

    setIsLoading(true)
    // Navigate to the specific game join page
    router.push(`/join/${gameCode.toUpperCase()}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Theme toggle */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6 fade-in">
        {/* Main Join Card */}
        <InteractiveCard hoverScale glowEffect>
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center float-animation">
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Join Game
            </CardTitle>
            <CardDescription className="text-lg">Enter the game code from your teacher</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="gameCode" className="text-base font-medium">
                  Game Code
                </Label>
                <div className="relative group">
                  <Hash
                    className={`absolute left-3 top-3 h-5 w-5 transition-colors duration-200 ${
                      isFocused ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <Input
                    id="gameCode"
                    value={gameCode}
                    onChange={(e) => setGameCode(e.target.value.toUpperCase())}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    placeholder="Enter game code"
                    className={`pl-12 text-lg h-12 transition-all duration-200 ${
                      isFocused ? "ring-2 ring-primary/20 border-primary" : ""
                    }`}
                    maxLength={10}
                    required
                  />
                  <div
                    className={`absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-secondary/10 opacity-0 transition-opacity duration-200 pointer-events-none ${
                      isFocused ? "opacity-100" : ""
                    }`}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-12 text-lg interactive-hover bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
                disabled={isLoading || !gameCode.trim()}
              >
                {isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
                Join Game
              </Button>
            </form>
          </CardContent>
        </InteractiveCard>

        {/* Instructions Card */}
        <InteractiveCard className="glass-effect">
          <CardContent className="p-4">
            <div className="text-center space-y-2">
              <h3 className="font-medium text-primary">How to Join</h3>
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="flex items-center justify-center gap-2">
                  <span className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-xs font-bold">
                    1
                  </span>
                  Get the game code from your teacher
                </p>
                <p className="flex items-center justify-center gap-2">
                  <span className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  Enter it above and click "Join Game"
                </p>
                <p className="flex items-center justify-center gap-2">
                  <span className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  Enter your name when prompted
                </p>
                <p className="flex items-center justify-center gap-2">
                  <span className="w-6 h-6 bg-primary/20 rounded-full flex items-center justify-center text-xs font-bold">
                    4
                  </span>
                  Wait for your teacher to start the game
                </p>
              </div>
            </div>
          </CardContent>
        </InteractiveCard>

        {/* Discrete Teacher Access */}
        <div className="text-center">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all duration-200 hover:scale-105 group"
          >
            <Settings className="h-4 w-4 group-hover:rotate-90 transition-transform duration-300" />
            Teacher Access
          </Link>
        </div>
      </div>
    </div>
  )
}
