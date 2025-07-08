"use client"

import type React from "react"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

interface InteractiveCardProps {
  children: React.ReactNode
  className?: string
  hoverScale?: boolean
  glowEffect?: boolean
}

export function InteractiveCard({ children, className, hoverScale = true, glowEffect = false }: InteractiveCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <Card
      className={cn(
        "transition-all duration-300 ease-out cursor-pointer",
        hoverScale && "hover:scale-105 active:scale-95",
        glowEffect && isHovered && "shadow-lg shadow-primary/20 dark:shadow-primary/30",
        "hover:shadow-xl dark:hover:shadow-2xl",
        "border-border/50 hover:border-border",
        "bg-card/80 backdrop-blur-sm",
        className,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
    </Card>
  )
}
