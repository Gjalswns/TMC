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
  rounds: z.coerce.number().min(1, {
    message: "Must have at least 1 round.",
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
      rounds: 3,
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsSubmitting(true);
    try {
      const result = await createGame(values);
      if (result.success) {
        toast({
          title: "Success!",
          description: `Game "${values.title}" has been created.`,
        });
        router.push(`/admin/game/${result.gameId}`);
      } else {
        toast({
          title: "Error",
          description:
            result.error || "Failed to create the game. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create the game. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
          name="rounds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Number of Rounds</FormLabel>
              <FormControl>
                <Input type="number" {...field} />
              </FormControl>
              <FormDescription>
                How many rounds will the game have?
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Game
        </Button>
      </form>
    </Form>
  );
}
