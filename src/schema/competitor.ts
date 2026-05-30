import { z } from "zod";

export const createCompetitorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  website: z.string().trim().min(1).optional(),
});

export const updateCompetitorSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").optional(),
    website: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.name !== undefined || data.website !== undefined, {
    message: "At least one field is required",
  });

export type CreateCompetitorInput = z.infer<typeof createCompetitorSchema>;
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorSchema>;
