import type { Organization, Board, Post, Status, Tag, User, Vote, Comment, ChangelogEntry, Customer, CustomerRequest } from '@prisma/client';

// Extended types with relations
export type BoardWithRelations = Board & {
  organization: Organization;
  tags: Tag[];
  _count: {
    posts: number;
  };
};

export type PostWithRelations = Post & {
  author: Pick<User, 'id' | 'name' | 'image'> | null;
  status: Status;
  board: Board;
  tags: Tag[];
  _count: {
    votes: number;
    comments: number;
  };
};

export type CommentWithRelations = Comment & {
  author: Pick<User, 'id' | 'name' | 'image'>;
  replies?: CommentWithRelations[];
};

export type ChangelogEntryWithRelations = ChangelogEntry & {
  linkedPosts: Array<{
    id: string;
    title: string;
    board: { slug: string };
  }>;
};

export type CustomerWithRelations = Customer & {
  _count: {
    requests: number;
  };
};

export type CustomerRequestWithRelations = CustomerRequest & {
  customer: Pick<Customer, 'id' | 'name' | 'company' | 'mrr'>;
  post: Pick<Post, 'id' | 'title'>;
};

// API Response types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form types
export interface CreatePostForm {
  title: string;
  content: string;
  boardId: string;
  tagIds?: string[];
  isAnonymous?: boolean;
}

export interface CreateBoardForm {
  name: string;
  slug: string;
  description?: string;
  isPublic?: boolean;
  allowAnonymous?: boolean;
  requireApproval?: boolean;
}

export interface CreateOrganizationForm {
  name: string;
  slug: string;
  description?: string;
}

// Filter types
export type PostSortOption = 'votes' | 'newest' | 'trending';
export type PostStatusFilter = string | 'all';

// User roles
export type UserRole = 'owner' | 'admin' | 'moderator' | 'member';

// Plan types
export type PlanType = 'free' | 'starter' | 'pro' | 'agency';

export interface Plan {
  id: PlanType;
  name: string;
  price: number;
  boardsLimit: number;
  features: string[];
}

export const PLANS: Record<PlanType, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    boardsLimit: 1,
    features: [
      'Unlimited users',
      '1 feedback board',
      'Public roadmap',
      'Basic analytics',
      'Community support',
    ],
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 29,
    boardsLimit: 3,
    features: [
      'Unlimited users',
      '3 feedback boards',
      'Custom branding',
      'Remove "Powered by"',
      'All integrations',
      'Priority support',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 79,
    boardsLimit: -1, // Unlimited
    features: [
      'Unlimited users',
      'Unlimited boards',
      'Custom domain',
      'API access',
      'Advanced analytics',
      'SSO ready',
      'Dedicated support',
    ],
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    price: 199,
    boardsLimit: -1,
    features: [
      'Everything in Pro',
      'Multi-client management',
      'White-label everything',
      'Priority API access',
      'Custom integrations',
      'SLA guarantee',
    ],
  },
};

// Webhook event types
export type WebhookEventType =
  | 'post.created'
  | 'post.updated'
  | 'post.deleted'
  | 'vote.created'
  | 'vote.deleted'
  | 'comment.created'
  | 'status.changed'
  | 'changelog.published';
