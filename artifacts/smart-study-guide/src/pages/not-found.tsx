import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md mx-4 border-border shadow-lg">
        <CardContent className="pt-10 pb-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center mb-6">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-bold font-serif text-foreground mb-2">404</h1>
          <p className="text-xl text-muted-foreground mb-8">
            This page doesn't exist. Let's get you back to studying.
          </p>
          <Link href="/">
            <Button size="lg" className="rounded-full shadow-md font-semibold px-8">
              Go back home
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
