import { z } from 'zod';

export const preferencesSchema = z.object({
  inAppNewPost: z.boolean().optional(),
  inAppStatusChange: z.boolean().optional(),
  inAppNewComment: z.boolean().optional(),
  inAppMention: z.boolean().optional(),
  emailNewPost: z.boolean().optional(),
  emailStatusChange: z.boolean().optional(),
  emailNewComment: z.boolean().optional(),
  emailMention: z.boolean().optional(),
  emailDigest: z.enum(['instant', 'none']).optional(),
});

// No digest worker exists. Previously saved daily/weekly choices deliver instantly.
export function effectiveEmailFrequency(frequency?: string): 'instant' | 'none' {
  return frequency === 'none' ? 'none' : 'instant';
}
