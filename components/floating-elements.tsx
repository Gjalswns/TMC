"use client"

import { useEffect, useState } from "react"

export function FloatingElements() {
  const [mounted, setMounted] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    setMounted(true)
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  if (!mounted || prefersReducedMotion) {
    return null
  }

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Floating geometric shapes */}
      <div
        className="absolute top-20 left-10 w-4 h-4 bg-primary/10 rounded-full animate-bounce"
        style={{ animationDelay: "0s", animationDuration: "3s" }}
      />
      <div
        className="absolute top-40 right-20 w-6 h-6 bg-secondary/10 rotate-45 animate-pulse"
        style={{ animationDelay: "1s", animationDuration: "4s" }}
      />
      <div
        className="absolute bottom-32 left-1/4 w-3 h-3 bg-accent/10 rounded-full animate-bounce"
        style={{ animationDelay: "2s", animationDuration: "5s" }}
      />
      <div
        className="absolute bottom-20 right-1/3 w-5 h-5 bg-muted/20 rotate-12 animate-pulse"
        style={{ animationDelay: "0.5s", animationDuration: "3.5s" }}
      />
      <div
        className="absolute top-1/2 left-20 w-2 h-2 bg-primary/15 rounded-full animate-bounce"
        style={{ animationDelay: "1.5s", animationDuration: "4.5s" }}
      />
      <div
        className="absolute top-1/3 right-10 w-4 h-4 bg-secondary/15 rotate-45 animate-pulse"
        style={{ animationDelay: "2.5s", animationDuration: "3s" }}
      />
    </div>
  )
}
