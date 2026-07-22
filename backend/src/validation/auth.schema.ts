import { z } from 'zod';

export const loginRequestSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
});

export type LoginRequestBody = z.infer<typeof loginRequestSchema>;
