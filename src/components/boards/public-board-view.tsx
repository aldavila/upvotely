'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/hooks/use-toast';
import {
  Search,
  Plus,
  ThumbsUp,
  MessageCircle,
  Loader2,
  ChevronUp,
  User,
} from 'lucide-react';
import { formatRelativeTime, getInitials } from '@/lib/utils';

interface Post {
  id: string;
  title: string;
  content: string;
  voteCount: number;
  isAnonymous: boolean;
  createdAt: Date;
  author: { id: string; name: string | null; image: string | null } | null;
  status: { id: string; name: string; color: string; slug: string };
  tags: { id: string; name: string; color: string }[];
  _count: { votes: number; comments: number };
}

interface Status {
  id: string;
  name: string;
  slug: string;
  color: string;
}

interface PublicBoardViewProps {
  board: {
    id: string;
    name: string;
    description: string | null;
    slug: string;
    allowAnonymous: boolean;
    organization: {
      id: string;
      name: string;
      slug: string;
      primaryColor: string;
      showBranding: boolean;
    };
    tags: { id: string; name: string; color: string }[];
  };
  posts: Post[];
  statuses: Status[];
  userVotes: string[];
  user?: { id?: string; name?: string | null; image?: string | null } | null;
  currentStatus?: string;
  currentSort?: string;
  searchQuery?: string;
}

export function PublicBoardView({
  board,
  posts,
  statuses,
  userVotes,
  user,
  currentStatus = 'all',
  currentSort = 'votes',
  searchQuery = '',
}: PublicBoardViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchQuery);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPostOpen, setNewPostOpen] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', content: '', anonymous: false });
  const [votingPosts, setVotingPosts] = useState<Set<string>>(new Set());
  const [localVotes, setLocalVotes] = useState<Set<string>>(new Set(userVotes));
  const [localVoteCounts, setLocalVoteCounts] = useState<Record<string, number>>(
    Object.fromEntries(posts.map((p) => [p.id, p.voteCount]))
  );

  const updateFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== 'all') {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters('q', search);
  };

  const handleVote = async (postId: string) => {
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to vote on posts.',
        variant: 'destructive',
      });
      return;
    }

    setVotingPosts((prev) => new Set(prev).add(postId));

    try {
      const res = await fetch(`/api/posts/${postId}/vote`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      setLocalVotes((prev) => {
        const newSet = new Set(prev);
        if (data.voted) {
          newSet.add(postId);
        } else {
          newSet.delete(postId);
        }
        return newSet;
      });

      setLocalVoteCounts((prev) => ({
        ...prev,
        [postId]: data.voteCount,
      }));
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to vote. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setVotingPosts((prev) => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };

  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user && !board.allowAnonymous) {
      toast({
        title: 'Sign in required',
        description: 'Please sign in to submit feedback.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newPost.title,
          content: newPost.content,
          boardId: board.id,
          isAnonymous: newPost.anonymous,
        }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      toast({
        title: 'Success',
        description: 'Your feedback has been submitted!',
      });

      setNewPostOpen(false);
      setNewPost({ title: '', content: '', anonymous: false });
      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to submit feedback.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Link href={`/${board.organization.slug}`} className="text-sm text-muted-foreground hover:underline">
                {board.organization.name}
              </Link>
              <h1 className="mt-1 text-2xl font-bold">{board.name}</h1>
              {board.description && (
                <p className="mt-2 text-muted-foreground">{board.description}</p>
              )}
            </div>
            <Dialog open={newPostOpen} onOpenChange={setNewPostOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> Submit Feedback
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Submit Feedback</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmitPost} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      placeholder="A short, descriptive title"
                      value={newPost.title}
                      onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content">Description</Label>
                    <Textarea
                      id="content"
                      placeholder="Describe your idea or feedback in detail..."
                      rows={5}
                      value={newPost.content}
                      onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                      required
                      disabled={isSubmitting}
                    />
                    <p className="text-xs text-muted-foreground">
                      Markdown is supported
                    </p>
                  </div>
                  {board.allowAnonymous && user && (
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <Label htmlFor="anonymous">Post anonymously</Label>
                        <p className="text-xs text-muted-foreground">
                          Your name won't be shown publicly
                        </p>
                      </div>
                      <Switch
                        id="anonymous"
                        checked={newPost.anonymous}
                        onCheckedChange={(checked) =>
                          setNewPost({ ...newPost, anonymous: checked })
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Submit Feedback
                  </Button>
                  {!user && (
                    <p className="text-center text-xs text-muted-foreground">
                      <Link href="/login" className="text-primary hover:underline">
                        Sign in
                      </Link>{' '}
                      to track your submissions
                    </p>
                  )}
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="border-b bg-muted/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search feedback..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </form>
            <div className="flex gap-2">
              <Select value={currentStatus} onValueChange={(v) => updateFilters('status', v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {statuses.map((status) => (
                    <SelectItem key={status.id} value={status.slug}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        {status.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={currentSort} onValueChange={(v) => updateFilters('sort', v)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="votes">Most Votes</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="trending">Trending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="container mx-auto px-4 py-6">
        {posts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <MessageCircle className="h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">No feedback yet</h3>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                Be the first to share your ideas!
              </p>
              <Button className="mt-6" onClick={() => setNewPostOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Submit Feedback
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => {
              const hasVoted = localVotes.has(post.id);
              const voteCount = localVoteCounts[post.id] ?? post.voteCount;
              const isVoting = votingPosts.has(post.id);

              return (
                <Card key={post.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex gap-4 p-4">
                    {/* Vote Button */}
                    <button
                      onClick={() => handleVote(post.id)}
                      disabled={isVoting}
                      className={`flex flex-col items-center justify-center rounded-lg border px-3 py-2 transition-colors ${
                        hasVoted
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'hover:border-primary hover:bg-primary/5'
                      }`}
                    >
                      {isVoting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ChevronUp className="h-4 w-4" />
                      )}
                      <span className="text-sm font-semibold">{voteCount}</span>
                    </button>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${board.organization.slug}/${board.slug}/${post.id}`}
                        className="text-lg font-semibold hover:underline"
                      >
                        {post.title}
                      </Link>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {post.content}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          style={{
                            borderColor: post.status.color,
                            color: post.status.color,
                          }}
                        >
                          {post.status.name}
                        </Badge>
                        {post.tags.map((tag) => (
                          <Badge key={tag.id} variant="secondary">
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          {post.isAnonymous || !post.author ? (
                            <>
                              <User className="h-3 w-3" />
                              <span>Anonymous</span>
                            </>
                          ) : (
                            <>
                              <Avatar className="h-4 w-4">
                                <AvatarImage src={post.author.image || undefined} />
                                <AvatarFallback className="text-[8px]">
                                  {getInitials(post.author.name || '')}
                                </AvatarFallback>
                              </Avatar>
                              <span>{post.author.name}</span>
                            </>
                          )}
                        </div>
                        <span>•</span>
                        <span>{formatRelativeTime(post.createdAt)}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {post._count.comments} comments
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Powered by */}
      {board.organization.showBranding && (
        <footer className="border-t py-4">
          <div className="container mx-auto px-4 text-center">
            <Link
              href="https://upvotely.io"
              target="_blank"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Powered by Upvotely
            </Link>
          </div>
        </footer>
      )}
    </div>
  );
}
