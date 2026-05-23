import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { Briefcase, ArrowRight, Sun, Moon } from "lucide-react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

const FIREBASE_ERRORS: Record<string, string> = {
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password. Please try again.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/invalid-email": "Please enter a valid email address.",
};

export default function Login() {
  const { toast } = useToast();
  const { theme, toggle } = useTheme();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof loginSchema>) {
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      toast({
        title: "Signed in successfully",
        description: "Welcome back to InterVent.",
      });
      setLocation("/dashboard/scheduler");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      toast({
        title: "Sign in failed",
        description: FIREBASE_ERRORS[code] ?? "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <button
        onClick={toggle}
        data-testid="button-theme-toggle"
        className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full flex items-center justify-center bg-card border border-card-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-full blur-[128px] opacity-30 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-gradient-to-tl from-[#667eea] to-[#764ba2] rounded-full blur-[128px] opacity-20 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-card rounded-2xl shadow-xl border border-card-border overflow-hidden relative z-10"
      >
        <div className="p-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white shadow-md">
              <Briefcase size={20} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              InterVent
            </h1>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-2">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in to your account to continue.</p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="name@example.com"
                        {...field}
                        data-testid="input-email"
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link href="#" className="text-xs text-primary hover:underline font-medium" data-testid="link-forgot-password">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        {...field}
                        data-testid="input-password"
                        className="h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90 transition-opacity text-white font-medium"
                disabled={isLoading}
                data-testid="button-submit-login"
              >
                {isLoading ? "Signing in..." : (
                  <>
                    Sign In
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </Form>
        </div>

        <div className="px-8 py-5 bg-muted/50 border-t border-card-border flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Don't have an account?{" "}
            <Link href="/register" className="text-primary font-semibold hover:underline" data-testid="link-register">
              Create one
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
