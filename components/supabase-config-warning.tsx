import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertTriangle, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"

export function SupabaseConfigWarning() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseKey) {
    return null // Don't show warning if properly configured
  }

  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertTriangle className="h-5 w-5" />
          Supabase Configuration Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-orange-700">
          <p className="mb-3">To use this application, you need to configure Supabase. Follow these steps:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>
              Create a new project at{" "}
              <a href="https://supabase.com" className="underline">
                supabase.com
              </a>
            </li>
            <li>Go to Settings → API to get your project URL and anon key</li>
            <li>Add these environment variables to your project:</li>
          </ol>
        </div>

        <div className="bg-white p-3 rounded border font-mono text-sm">
          <div>NEXT_PUBLIC_SUPABASE_URL=your_project_url</div>
          <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key</div>
        </div>

        <div className="text-orange-700 text-sm">
          <p className="mb-2">After adding the environment variables:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Run the SQL script in the scripts folder to create the database tables</li>
            <li>Restart your development server</li>
          </ol>
        </div>

        <Button asChild variant="outline" className="w-full bg-transparent">
          <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Open Supabase Dashboard
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}
