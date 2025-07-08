import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, Trophy, Smartphone, Clock } from "lucide-react"
import { redirect } from "next/navigation"

export default function HomePage() {
  // Automatically redirect to the join game page
  redirect("/join")

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900">Classroom Games</h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Create engaging, interactive games for your students. Easy setup, real-time participation, and automatic
            scoring.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild size="lg">
              <Link href="/admin">Teacher Dashboard</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/join">Join Game</Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          <Card>
            <CardHeader className="text-center">
              <Users className="h-12 w-12 mx-auto text-blue-600 mb-2" />
              <CardTitle>Easy Setup</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Create games in seconds with customizable settings for any class size
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Smartphone className="h-12 w-12 mx-auto text-green-600 mb-2" />
              <CardTitle>BYOD Ready</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Students join using their phones, tablets, or any device with a browser
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Trophy className="h-12 w-12 mx-auto text-yellow-600 mb-2" />
              <CardTitle>Live Scoring</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Real-time scoreboard keeps everyone engaged and motivated
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="text-center">
              <Clock className="h-12 w-12 mx-auto text-purple-600 mb-2" />
              <CardTitle>Structured Rounds</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-center">
                Three-round format with automatic progression and time management
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        {/* How it Works */}
        <div className="text-center space-y-8">
          <h2 className="text-3xl font-bold">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-blue-600">1</span>
              </div>
              <h3 className="text-xl font-semibold">Create Game</h3>
              <p className="text-gray-600">
                Set up your game with title, duration, and number of teams. Get a unique game code instantly.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-green-600">2</span>
              </div>
              <h3 className="text-xl font-semibold">Students Join</h3>
              <p className="text-gray-600">
                Students scan the QR code or enter the game code to join. Assign teams automatically or manually.
              </p>
            </div>
            <div className="space-y-4">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-2xl font-bold text-purple-600">3</span>
              </div>
              <h3 className="text-xl font-semibold">Play & Score</h3>
              <p className="text-gray-600">
                Start the game and manage scores in real-time. Students see live updates on their devices.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
