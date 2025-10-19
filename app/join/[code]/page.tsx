import { getGameForJoin } from "@/lib/game-actions";
import JoinGameWithCode from "@/components/join-game-with-code";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  try {
    // Await params in Next.js 15
    const { code } = await params;
    const result = await getGameForJoin(code);

    if (!result.success) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
          <div className="text-center">
            <h1 className="text-4xl font-bold">Game not found</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">
              The game code "{code}" does not exist or is invalid.
            </p>
          </div>
        </div>
      );
    }

    return <JoinGameWithCode game={result.game} />;
  } catch (error) {
    console.error("Unexpected error in JoinPage:", error);
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold">Error</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mt-2">
            An unexpected error occurred. Please try again.
          </p>
        </div>
      </div>
    );
  }
}
