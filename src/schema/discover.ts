import { z } from "zod";

export const discoverSchema = z.object({
  companyName: z.string().trim().min(1).optional(),
});

export const subscribeSchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        website: z.string().trim().min(1),
        pricingUrl: z.string().optional(),
        changelogUrl: z.string().optional(),
        careersUrl: z.string().optional(),
        blogUrl: z.string().optional(),
      }),
    )
    .min(1),
});

export type DiscoverInput = z.infer<typeof discoverSchema>;
export type SubscribeInput = z.infer<typeof subscribeSchema>;
