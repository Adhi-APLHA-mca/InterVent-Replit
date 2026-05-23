import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { Briefcase, Building, ArrowLeft, ArrowRight, UserCircle, Sun, Moon } from "lucide-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { auth, db } from "@/lib/firebase";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

type Role = "student" | "hr" | null;

const registerSchema = z.object({
  role: z.enum(["student", "hr"]),
  fullName: z.string().min(2, { message: "Full name is required." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
  confirmPassword: z.string(),
  phoneNumber: z.string().min(5, { message: "Phone number is required." }),
  companyName: z.string().optional(),
  department: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
}).refine((data) => {
  if (data.role === "hr") return !!data.companyName && data.companyName.trim().length > 0;
  return true;
}, {
  message: "Company name is required for HR managers.",
  path: ["companyName"],
}).refine((data) => {
  if (data.role === "hr") return !!data.department && data.department.trim().length > 0;
  return true;
}, {
  message: "Department is required for HR managers.",
  path: ["department"],
});

export default function Register() {
  const { toast } = useToast();
  const { theme, toggle } = useTheme();
  const [, setLocation] = useLocation();
  const [selectedRole, setSelectedRole] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "student",
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      phoneNumber: "",
      companyName: "",
      department: "",
    },
  });

  async function onSubmit(values: z.infer<typeof registerSchema>) {
    setIsLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, values.email, values.password);

      await updateProfile(cred.user, { displayName: values.fullName });

      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        role: values.role,
        fullName: values.fullName,
        email: values.email,
        phone: values.phoneNumber,
        ...(values.role === "hr" && {
          companyName: values.companyName,
          department: values.department,
        }),
        createdAt: serverTimestamp(),
      });

      toast({
        title: "Account created!",
        description: `Welcome to InterVent, ${values.fullName}! Please sign in.`,
      });
      setLocation("/");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      toast({
        title: "Registration failed",
        description: msg.replace("Firebase: ", "").replace(/\(auth\/.*\)\.?/, "").trim(),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleRoleSelect = (role: "student" | "hr") => {
    setSelectedRole(role);
    form.setValue("role", role);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 relative overflow-hidden py-12">
      <button
        onClick={toggle}
        data-testid="button-theme-toggle"
        className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full flex items-center justify-center bg-card border border-card-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm"
        aria-label="Toggle theme"
      >
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
      </button>

      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-gradient-to-br from-[#667eea] to-[#764ba2] rounded-full blur-[128px] opacity-30 pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-96 h-96 bg-gradient-to-tl from-[#667eea] to-[#764ba2] rounded-full blur-[128px] opacity-20 pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={cn(
          "w-full bg-card rounded-2xl shadow-xl border border-card-border overflow-hidden relative z-10 transition-all duration-500",
          selectedRole ? "max-w-2xl" : "max-w-lg"
        )}
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

          <AnimatePresence mode="wait">
            {!selectedRole ? (
              <motion.div
                key="role-selection"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="mb-8">
                  <h2 className="text-2xl font-semibold mb-2">Join InterVent</h2>
                  <p className="text-muted-foreground">Select how you want to use the platform.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => handleRoleSelect("hr")}
                    className="flex flex-col items-center justify-center p-8 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
                    data-testid="button-role-hr"
                  >
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors text-primary">
                      <Building size={32} />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">HR Manager</h3>
                    <p className="text-sm text-muted-foreground text-center">Post interviews and hire top talent</p>
                  </button>

                  <button
                    onClick={() => handleRoleSelect("student")}
                    className="flex flex-col items-center justify-center p-8 border-2 border-border rounded-xl hover:border-primary hover:bg-primary/5 transition-all group"
                    data-testid="button-role-student"
                  >
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors text-primary">
                      <UserCircle size={32} />
                    </div>
                    <h3 className="text-lg font-semibold mb-1">Student</h3>
                    <p className="text-sm text-muted-foreground text-center">Apply for interviews and land your job</p>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="registration-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.4 }}
              >
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold mb-2">
                      Create {selectedRole === "hr" ? "HR" : "Student"} Account
                    </h2>
                    <p className="text-muted-foreground text-sm">Fill in your details to get started.</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedRole(null)}
                    className="text-muted-foreground"
                    data-testid="button-change-role"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Change Role
                  </Button>
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input placeholder="John Doe" {...field} className="h-11" data-testid="input-fullname" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="john@example.com" type="email" {...field} className="h-11" data-testid="input-email" />
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
                            <FormLabel>Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} className="h-11" data-testid="input-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} className="h-11" data-testid="input-confirm-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="phoneNumber"
                        render={({ field }) => (
                          <FormItem className={selectedRole === "student" ? "md:col-span-2" : ""}>
                            <FormLabel>Phone Number</FormLabel>
                            <FormControl>
                              <Input placeholder="+91 98765 43210" {...field} className="h-11" data-testid="input-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {selectedRole === "hr" && (
                        <>
                          <FormField
                            control={form.control}
                            name="companyName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Company Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Acme Corp" {...field} className="h-11" data-testid="input-company" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="department"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Department</FormLabel>
                                <FormControl>
                                  <Input placeholder="Engineering" {...field} className="h-11" data-testid="input-department" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-12 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-90 transition-opacity text-white font-medium text-lg mt-4"
                      disabled={isLoading}
                      data-testid="button-submit-register"
                    >
                      {isLoading ? "Creating account…" : (
                        <>Create Account <ArrowRight className="ml-2 h-5 w-5" /></>
                      )}
                    </Button>
                  </form>
                </Form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-8 py-5 bg-muted/50 border-t border-card-border flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/" className="text-primary font-semibold hover:underline" data-testid="link-login">
              Log in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
