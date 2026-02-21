import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(date));
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years}y ago`;
  if (months > 0) return `${months}mo ago`;
  if (weeks > 0) return `${weeks}w ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateApiKey(): string {
  // Use crypto for secure random generation
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'upv_';
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(array[i] % chars.length);
  }
  return result;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function calculateTrending(
  voteCount: number,
  createdAt: Date,
  commentCount: number = 0
): number {
  const ageInHours = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60);
  const gravity = 1.8;
  
  // Reddit-style hot ranking
  const score = voteCount + commentCount * 0.5;
  return score / Math.pow(ageInHours + 2, gravity);
}

export const STATUS_COLORS: Record<string, string> = {
  open: '#6b7280',
  under_review: '#f59e0b',
  planned: '#3b82f6',
  in_progress: '#8b5cf6',
  complete: '#10b981',
  closed: '#ef4444',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  under_review: 'Under Review',
  planned: 'Planned',
  in_progress: 'In Progress',
  complete: 'Complete',
  closed: 'Closed',
};

export const CHANGELOG_TYPES: Record<string, { label: string; color: string }> = {
  feature: { label: 'New Feature', color: '#10b981' },
  improvement: { label: 'Improvement', color: '#3b82f6' },
  fix: { label: 'Bug Fix', color: '#f59e0b' },
  other: { label: 'Other', color: '#6b7280' },
};
