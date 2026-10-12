import { z } from "zod";

export const CreateRecordSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(120, "Title cannot exceed 120 characters")
    .trim(),
  content: z
    .string()
    .min(1, "Content is required")
    .max(5000, "Content cannot exceed 5000 characters")
    .trim(),
  category: z
    .string()
    .max(50)
    .default("General"),
  status: z
    .enum(["ACTIVE", "ARCHIVED"])
    .default("ACTIVE"),
});

export type CreateRecordInput = z.infer<typeof CreateRecordSchema>;
