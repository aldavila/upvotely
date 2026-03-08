import { z } from 'zod';

// Auth validators
export const signUpSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
});

export const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Organization validators
export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(50),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500).optional(),
});

export const updateOrganizationSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(500).optional(),
  logo: z.string().url().optional().nullable(),
  favicon: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  showBranding: z.boolean().optional(),
  customDomain: z.string().max(255).optional().nullable(),
  webhookUrl: z.string().url().optional().nullable(),
  webhookEvents: z.array(z.string()).optional(),
});

// Board validators
export const createBoardSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().default(true),
  allowAnonymous: z.boolean().default(false),
  requireApproval: z.boolean().default(false),
});

export const updateBoardSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  allowAnonymous: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  showVoteCount: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

// Post validators
export const createPostSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  content: z.string().min(10, 'Content must be at least 10 characters').max(10000),
  boardId: z.string().cuid(),
  tagIds: z.array(z.string().cuid()).optional(),
  isAnonymous: z.boolean().default(false),
});

export const updatePostSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  content: z.string().min(10).max(10000).optional(),
  statusId: z.string().cuid().optional(),
  tagIds: z.array(z.string().cuid()).optional(),
  isPinned: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  eta: z.string().datetime().optional().nullable(),
});

export const mergePostsSchema = z.object({
  sourcePostId: z.string().cuid(),
  targetPostId: z.string().cuid(),
});

// Comment validators
export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(5000),
  postId: z.string().cuid(),
  parentId: z.string().cuid().optional(),
  isInternal: z.boolean().default(false),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1).max(5000),
});

// Status validators
export const createStatusSchema = z.object({
  name: z.string().min(2).max(50),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9_]+$/),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  type: z.enum(['open', 'under_review', 'planned', 'in_progress', 'complete', 'closed']),
  showOnRoadmap: z.boolean().default(false),
  position: z.number().int().min(0).optional(),
});

// Tag validators
export const createTagSchema = z.object({
  name: z.string().min(2).max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#6b7280'),
  boardId: z.string().cuid(),
});

// Changelog validators
export const createChangelogSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(10).max(20000),
  type: z.enum(['feature', 'improvement', 'fix', 'other']).default('improvement'),
  imageUrl: z.string().url().optional().nullable(),
  isPublished: z.boolean().default(false),
  linkedPostIds: z.array(z.string().cuid()).optional(),
});

export const updateChangelogSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  content: z.string().min(10).max(20000).optional(),
  type: z.enum(['feature', 'improvement', 'fix', 'other']).optional(),
  imageUrl: z.string().url().optional().nullable(),
  isPublished: z.boolean().optional(),
  linkedPostIds: z.array(z.string().cuid()).optional(),
});

// API Key validators
export const createApiKeySchema = z.object({
  name: z.string().min(2).max(100),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).default(['read']),
  expiresAt: z.string().datetime().optional().nullable(),
});

// Customer validators
export const identifyCustomerSchema = z.object({
  externalId: z.string().min(1, 'External ID is required').max(255),
  name: z.string().max(255).optional(),
  email: z.string().email().optional(),
  company: z.string().max(255).optional(),
  mrr: z.number().min(0).optional(),
  plan: z.string().max(100).optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const createCustomerRequestSchema = z.object({
  externalId: z.string().min(1, 'Customer external ID is required'),
  postId: z.string().cuid(),
  priority: z.number().int().min(1).max(5).optional(),
});

export const listCustomersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

// Type exports
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type CreateBoardInput = z.infer<typeof createBoardSchema>;
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateChangelogInput = z.infer<typeof createChangelogSchema>;
export type UpdateChangelogInput = z.infer<typeof updateChangelogSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type IdentifyCustomerInput = z.infer<typeof identifyCustomerSchema>;
export type CreateCustomerRequestInput = z.infer<typeof createCustomerRequestSchema>;
