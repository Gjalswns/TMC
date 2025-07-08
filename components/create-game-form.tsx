"use client"

import { useState } from "react"
import { createGame } from "@/lib/game-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useRouter } from "next/navigation"
import { Loader2, AlertCircle, Sparkles } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export function CreateGameForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [focusedField, setFocusedField] = useState("")
  const router = useRouter()

  async function handleSubmit(formData: FormData) {
    setIsLoading(true)
    setError("")

    try {
      const result = await createGame(formData)
      if (result.success) {
        router.push(`/admin/game/${result.gameId}`)
      } else {
        setError(result.error || "Failed to create game")
      }
    } catch (error) {
      setError("Failed to create game. Please check your Supabase configuration.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive" className="animate-in slide-in-from-top-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm font-medium">
          Game Title
        </Label>
        <Input
          id="title"
          name="title"
          placeholder="Enter game title"
          required
          className={`transition-all duration-200 ${
            focusedField === "title" ? "ring-2 ring-primary/20 border-primary" : ""
          }`}
          onFocus={() => setFocusedField("title")}
          onBlur={() => setFocusedField("")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="gradeClass" className="text-sm font-medium">
          Grade/Class
        </Label>
        <Input
          id="gradeClass"
          name="gradeClass"
          placeholder="e.g., Grade 5A, Class 10B"
          required
          className={`transition-all duration-200 ${
            focusedField === "gradeClass" ? "ring-2 ring-primary/20 border-primary" : ""
          }`}
          onFocus={() => setFocusedField("gradeClass")}
          onBlur={() => setFocusedField("")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="duration" className="text-sm font-medium">
          Duration (minutes)
        </Label>
        <Select name="duration" required>
          <SelectTrigger className="transition-all duration-200 hover:border-primary/50">
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 minutes</SelectItem>
            <SelectItem value="30">30 minutes</SelectItem>
            <SelectItem value="45">45 minutes</SelectItem>
            <SelectItem value="60">60 minutes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="teamCount" className="text-sm font-medium">
          Number of Teams
        </Label>
        <Select name="teamCount" required>
          <SelectTrigger className="transition-all duration-200 hover:border-primary/50">
            <SelectValue placeholder="Select team count" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 Teams</SelectItem>
            <SelectItem value="3">3 Teams</SelectItem>
            <SelectItem value="4">4 Teams</SelectItem>
            <SelectItem value="5">5 Teams</SelectItem>
            <SelectItem value="6">6 Teams</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        type="submit"
        className="w-full interactive-hover bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating Game...
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Create Game
          </>
        )}
      </Button>
    </form>
  )
}
