import type { Prisma } from '@prisma/client';

// Public payload allowlists shared by pages and route handlers.
export const publicOrganizationSelect = {
  id: true,
  name: true,
  slug: true,
  logo: true,
  primaryColor: true,
  accentColor: true,
  showBranding: true,
} as const satisfies Prisma.OrganizationSelect;

export const publicUserSelect = {
  id: true,
  name: true,
  image: true,
} as const satisfies Prisma.UserSelect;

export const publicStatusSelect = {
  id: true,
  name: true,
  slug: true,
  color: true,
} as const satisfies Prisma.StatusSelect;

export const publicTagSelect = {
  id: true,
  name: true,
  color: true,
} as const satisfies Prisma.TagSelect;

export const publicBoardSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  allowAnonymous: true,
  organization: { select: publicOrganizationSelect },
} as const satisfies Prisma.BoardSelect;

export const publicPostCountsSelect = {
  votes: true,
  comments: { where: { isInternal: false } },
} as const satisfies Prisma.PostCountOutputTypeSelect;

export const publicPostSelect = {
  id: true,
  title: true,
  content: true,
  voteCount: true,
  isAnonymous: true,
  createdAt: true,
  author: { select: publicUserSelect },
  status: { select: publicStatusSelect },
  tags: { select: publicTagSelect },
  _count: { select: publicPostCountsSelect },
} as const satisfies Prisma.PostSelect;

export const publicPostPreviewSelect = {
  id: true,
  title: true,
  voteCount: true,
} as const satisfies Prisma.PostSelect;

export const publicPostSuggestionSelect = {
  ...publicPostPreviewSelect,
  status: { select: { name: true, color: true, slug: true } },
} as const satisfies Prisma.PostSelect;

export const publicRoadmapPostSelect = {
  id: true,
  title: true,
  statusId: true,
  eta: true,
  status: { select: { type: true } },
  board: { select: { name: true, slug: true } },
  _count: { select: publicPostCountsSelect },
} as const satisfies Prisma.PostSelect;

export const publicChangelogSelect = {
  id: true,
  title: true,
  content: true,
  type: true,
  publishedAt: true,
  createdAt: true,
  imageUrl: true,
  linkedPosts: {
    select: {
      id: true,
      title: true,
      board: { select: { slug: true } },
    },
  },
} as const satisfies Prisma.ChangelogEntrySelect;

export const publicCommentSelect = {
  id: true,
  content: true,
  isInternal: true,
  createdAt: true,
  author: { select: publicUserSelect },
} as const satisfies Prisma.CommentSelect;

export type PublicOrganization = Prisma.OrganizationGetPayload<{ select: typeof publicOrganizationSelect }>;
export type PublicBoard = Prisma.BoardGetPayload<{ select: typeof publicBoardSelect }>;
export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
export type PublicStatus = Prisma.StatusGetPayload<{ select: typeof publicStatusSelect }>;
export type PublicPost = Prisma.PostGetPayload<{ select: typeof publicPostSelect }>;
export type PublicComment = Prisma.CommentGetPayload<{ select: typeof publicCommentSelect }>;
