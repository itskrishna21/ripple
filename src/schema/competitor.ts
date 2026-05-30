import { z } from "zod";

const urlField = z.string().trim().min(1);

export const createCompetitorSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  website: urlField.optional(),
  pricingUrl: urlField.optional(),
  changelogUrl: urlField.optional(),
  careersUrl: urlField.optional(),
  blogUrl: urlField.optional(),
});

export const updateCompetitorSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").optional(),
    website: urlField.optional(),
    pricingUrl: urlField.optional(),
    changelogUrl: urlField.optional(),
    careersUrl: urlField.optional(),
    blogUrl: urlField.optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.website !== undefined ||
      data.pricingUrl !== undefined ||
      data.changelogUrl !== undefined ||
      data.careersUrl !== undefined ||
      data.blogUrl !== undefined,
    { message: "At least one field is required" },
  );

export type CreateCompetitorInput = z.infer<typeof createCompetitorSchema>;
export type UpdateCompetitorInput = z.infer<typeof updateCompetitorSchema>;
