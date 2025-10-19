"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createGame } from "@/lib/game-actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  title: z.string().min(2, {
    message: "Game title must be at least 2 characters.",
  }),
  gameType: z.string().min(1, {
    message: "Please select a game type.",
  }),
  teamCount: z.coerce.number().min(2, {
    message: "Must have at least 2 teams.",
  }).max(10, {
    message: "Cannot have more than 10 teams.",
  }),
});

export function CreateGameForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      gameType: "year-game", // Default to Year Game as per README
      teamCount: 4, // Default to 4 teams for TMC games
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    console.log("🎮 Form validation passed! Creating game with values:", values);
    setIsSubmitting(true);
    
    try {
      console.log("🎮 Calling createGame action...");
      const result = await createGame(values);
      console.log("🎮 Game creation result:", result);
      
      if (result.success) {
        console.log("✅ Game created successfully! Game ID:", result.gameId);
        toast({
          title: "Success!",
          description: `Game "${values.title}" has been created. Code: ${result.gameCode}`,
        });
        
        console.log("🎮 Redirecting to game page...");
        router.push(`/admin/game/${result.gameId}`);
      } else {
        console.error("❌ Game creation failed:", result.error);
        toast({
          title: "Error",
          description: result.error || "Failed to create the game. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("❌ Exception during game creation:", error);
      toast({
        title: "Error",
        description: `Failed to create the game: ${(error as Error).message}`,
        variant: "destructive",
      });
    } finally {
      console.log("🎮 Form submission complete, resetting loading state");
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          console.log("🎮 Form submit event triggered");
          console.log("🎮 Form values:", form.getValues());
          console.log("🎮 Form errors:", form.formState.errors);
          console.log("🎮 Form is valid:", form.formState.isValid);
          
          form.handleSubmit(
            (data) => {
              console.log("✅ Validation passed, calling onSubmit with:", data);
              onSubmit(data);
            },
            (errors) => {
              console.error("❌ Form validation failed:", errors);
              toast({
                title: "Validation Error",
                description: "Please check all fields and try again.",
                variant: "destructive",
              });
            }
          )(e);
        }} 
        className="space-y-8"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Game Title</FormLabel>
              <FormControl>
                <Input placeholder="My Awesome Game" {...field} />
              </FormControl>
              <FormDescription>This is the title of your game.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="gameType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Game Type</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a game type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="general">General Game</SelectItem>
                  <SelectItem value="year-game">Year Game</SelectItem>
                  <SelectItem value="score-steal">Score Steal Game</SelectItem>
                  <SelectItem value="relay-quiz">Relay Quiz Game</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Choose the type of game you want to create.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="teamCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Teams</FormLabel>
              <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select number of teams" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="2">2 Teams</SelectItem>
                  <SelectItem value="3">3 Teams</SelectItem>
                  <SelectItem value="4">4 Teams (Recommended)</SelectItem>
                  <SelectItem value="5">5 Teams</SelectItem>
                  <SelectItem value="6">6 Teams</SelectItem>
                  <SelectItem value="8">8 Teams</SelectItem>
                  <SelectItem value="10">10 Teams</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                How many teams will participate in the game?
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          disabled={isSubmitting}
          onClick={() => console.log("🎮 Button clicked, form state:", form.formState)}
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Game
        </Button>
      </form>
    </Form>
  );
}
