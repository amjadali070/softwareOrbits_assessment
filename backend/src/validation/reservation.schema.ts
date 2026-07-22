import { z } from 'zod';

export const reserveSeatsRequestSchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  seatIds: z.array(z.string().trim().min(1)).min(1, 'At least one seatId is required'),
});

export type ReserveSeatsRequestBody = z.infer<typeof reserveSeatsRequestSchema>;
