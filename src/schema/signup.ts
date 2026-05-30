import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().trim().min(1, "Email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  companyName: z.string().trim().min(1, "Company name is required"),
});

export type SignupInput = z.infer<typeof signupSchema>;
