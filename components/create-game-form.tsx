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
import { Checkbox } from "@/components/ui/checkbox";
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
  usesBrackets: z.boolean().default(true),
});

export function CreateGameForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      usesBrackets: true, // Default to using brackets for TMC
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
                <Input placeholder="TMC 2024" {...field} />
              </FormControl>
              <FormDescription>
                All games consist of 3 rounds: Year Game → Score Steal → Relay Quiz
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="usesBrackets"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  Use Higher/Lower Brackets
                </FormLabel>
                <FormDescription>
                  Enable bracket system for Score Steal game (Higher vs Lower brackets)
                </FormDescription>
              </div>
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
