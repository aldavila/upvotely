'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, MessageSquare, Reply, Send } from 'lucide-react';
import { formatRelativeTime, getInitials, cn } from '@/lib/utils';

interface CommentAuthor {
  id: string;
  name: string | null;
  image: string | null;
}

interface Comment {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  author: CommentAuthor;
  replies?: Comment[];
}

interface CommentsSectionProps {
  postId: string;
  isTeamMember: boolean;
  initialComments?: Comment[];
}

export function CommentsSection({ postId, isTeamMember, initialComments = [] }: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isReplyInternal, setIsReplyInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (parentId?: string) => {
    const commentContent = parentId ? replyContent : content;
    const commentIsInternal = parentId ? isReplyInternal : isInternal;

    if (!commentContent.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: commentContent,
          postId,
          parentId: parentId || undefined,
          isInternal: commentIsInternal,
        }),
      });

      if (res.ok) {
        const newComment = await res.json();
        if (parentId) {
          setComments(prev =>
            prev.map(c =>
              c.id === parentId
                ? { ...c, replies: [...(c.replies || []), newComment] }
                : c
            )
          );
          setReplyTo(null);
          setReplyContent('');
          setIsReplyInternal(false);
        } else {
          setComments(prev => [newComment, ...prev]);
          setContent('');
          setIsInternal(false);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Comments
          <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* New Comment Form */}
        <div className="space-y-3">
          <Textarea
            placeholder={isInternal ? 'Write an internal note...' : 'Write a comment...'}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            className={cn(
              isInternal && 'border-amber-300 bg-amber-50/50 dark:border-amber-700 dark:bg-amber-950/20'
            )}
          />
          <div className="flex items-center justify-between">
            {isTeamMember && (
              <div className="flex items-center gap-2">
                <Switch
                  id="internal-toggle"
                  checked={isInternal}
                  onCheckedChange={setIsInternal}
                />
                <Label htmlFor="internal-toggle" className="flex items-center gap-1.5 text-sm">
                  <Lock className="h-3.5 w-3.5" />
                  Internal note
                </Label>
              </div>
            )}
            <Button
              onClick={() => handleSubmit()}
              disabled={!content.trim() || isSubmitting}
              size="sm"
            >
              <Send className="mr-2 h-4 w-4" />
              {isInternal ? 'Add Note' : 'Comment'}
            </Button>
          </div>
        </div>

        {/* Comments List */}
        {comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No comments yet. Be the first!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                isTeamMember={isTeamMember}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                replyContent={replyContent}
                setReplyContent={setReplyContent}
                isReplyInternal={isReplyInternal}
                setIsReplyInternal={setIsReplyInternal}
                onReplySubmit={handleSubmit}
                isSubmitting={isSubmitting}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CommentItem({
  comment,
  isTeamMember,
  replyTo,
  setReplyTo,
  replyContent,
  setReplyContent,
  isReplyInternal,
  setIsReplyInternal,
  onReplySubmit,
  isSubmitting,
}: {
  comment: Comment;
  isTeamMember: boolean;
  replyTo: string | null;
  setReplyTo: (id: string | null) => void;
  replyContent: string;
  setReplyContent: (content: string) => void;
  isReplyInternal: boolean;
  setIsReplyInternal: (val: boolean) => void;
  onReplySubmit: (parentId: string) => void;
  isSubmitting: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        comment.isInternal && 'border-l-4 border-l-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author.image || undefined} />
          <AvatarFallback className="text-xs">
            {getInitials(comment.author.name || 'U')}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.author.name || 'Anonymous'}</span>
            {comment.isInternal && (
              <Badge
                variant="outline"
                className="border-amber-400 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              >
                <Lock className="mr-1 h-3 w-3" />
                Internal
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(new Date(comment.createdAt))}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
          >
            <Reply className="mr-1 h-3 w-3" />
            Reply
          </Button>
        </div>
      </div>

      {/* Reply Form */}
      {replyTo === comment.id && (
        <div className="ml-11 mt-3 space-y-2">
          <Textarea
            placeholder="Write a reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            rows={2}
            className={cn(
              'text-sm',
              isReplyInternal && 'border-amber-300 bg-amber-50/50'
            )}
          />
          <div className="flex items-center justify-between">
            {isTeamMember && (
              <div className="flex items-center gap-2">
                <Switch
                  id={`reply-internal-${comment.id}`}
                  checked={isReplyInternal}
                  onCheckedChange={setIsReplyInternal}
                />
                <Label htmlFor={`reply-internal-${comment.id}`} className="flex items-center gap-1 text-xs">
                  <Lock className="h-3 w-3" />
                  Internal
                </Label>
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => onReplySubmit(comment.id)}
                disabled={!replyContent.trim() || isSubmitting}
              >
                Reply
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-11 mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <div
              key={reply.id}
              className={cn(
                'rounded-lg border p-3',
                reply.isInternal && 'border-l-4 border-l-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={reply.author.image || undefined} />
                  <AvatarFallback className="text-xs">
                    {getInitials(reply.author.name || 'U')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{reply.author.name || 'Anonymous'}</span>
                    {reply.isInternal && (
                      <Badge
                        variant="outline"
                        className="border-amber-400 bg-amber-100 text-xs text-amber-700"
                      >
                        <Lock className="mr-1 h-2.5 w-2.5" />
                        Internal
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeTime(new Date(reply.createdAt))}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{reply.content}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
