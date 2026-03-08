'use client';

import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Lock,
  MessageSquare,
  Reply,
  Send,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

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

interface CommentListProps {
  postId: string;
  initialComments: Comment[];
  isTeamMember: boolean;
  currentUserId?: string;
}

export function CommentList({
  postId,
  initialComments,
  isTeamMember,
  currentUserId,
}: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>(initialComments);
  const [newComment, setNewComment] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [showInternal, setShowInternal] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [isReplyInternal, setIsReplyInternal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredComments = showInternal
    ? comments
    : comments
        .filter((c) => !c.isInternal)
        .map((c) => ({
          ...c,
          replies: c.replies?.filter((r) => !r.isInternal),
        }));

  async function handleSubmit(parentId?: string) {
    const content = parentId ? replyContent : newComment;
    const internal = parentId ? isReplyInternal : isInternal;

    if (!content.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          postId,
          parentId,
          isInternal: internal,
        }),
      });

      if (!res.ok) throw new Error('Failed to post comment');

      const comment = await res.json();

      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: [...(c.replies ?? []), comment] }
              : c
          )
        );
        setReplyContent('');
        setReplyingTo(null);
        setIsReplyInternal(false);
      } else {
        setComments((prev) => [...prev, { ...comment, replies: [] }]);
        setNewComment('');
        setIsInternal(false);
      }
    } catch {
      // Error handled silently — could add toast here
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with internal toggle */}
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <MessageSquare className="h-5 w-5" />
          Comments ({comments.length})
        </h3>
        {isTeamMember && (
          <div className="flex items-center gap-2">
            <Switch
              id="show-internal"
              checked={showInternal}
              onCheckedChange={setShowInternal}
            />
            <Label htmlFor="show-internal" className="text-sm text-muted-foreground">
              Show internal notes
            </Label>
          </div>
        )}
      </div>

      <Separator />

      {/* Comment list */}
      <div className="space-y-4">
        {filteredComments.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No comments yet. Be the first to comment!
          </p>
        ) : (
          filteredComments.map((comment) => (
            <div key={comment.id} className="space-y-3">
              <CommentItem
                comment={comment}
                isTeamMember={isTeamMember}
                onReply={() => setReplyingTo(comment.id)}
              />

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="ml-8 space-y-3 border-l-2 border-muted pl-4">
                  {comment.replies.map((reply) => (
                    <CommentItem
                      key={reply.id}
                      comment={reply}
                      isTeamMember={isTeamMember}
                    />
                  ))}
                </div>
              )}

              {/* Reply form */}
              {replyingTo === comment.id && currentUserId && (
                <div className="ml-8 space-y-2 border-l-2 border-primary/30 pl-4">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="min-h-[80px]"
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isTeamMember && (
                        <>
                          <Switch
                            id="reply-internal"
                            checked={isReplyInternal}
                            onCheckedChange={setIsReplyInternal}
                          />
                          <Label
                            htmlFor="reply-internal"
                            className="flex items-center gap-1 text-sm"
                          >
                            <Lock className="h-3 w-3" />
                            Internal
                          </Label>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent('');
                          setIsReplyInternal(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSubmit(comment.id)}
                        disabled={isSubmitting || !replyContent.trim()}
                      >
                        <Send className="mr-1 h-3 w-3" />
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <Separator />

      {/* New comment form */}
      {currentUserId ? (
        <div className="space-y-3">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            className="min-h-[100px]"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isTeamMember && (
                <>
                  <Switch
                    id="new-internal"
                    checked={isInternal}
                    onCheckedChange={setIsInternal}
                  />
                  <Label
                    htmlFor="new-internal"
                    className="flex items-center gap-1 text-sm"
                  >
                    <Lock className="h-3 w-3" />
                    Internal note
                  </Label>
                  {isInternal && (
                    <span className="text-xs text-amber-600">
                      Only visible to team members
                    </span>
                  )}
                </>
              )}
            </div>
            <Button
              onClick={() => handleSubmit()}
              disabled={isSubmitting || !newComment.trim()}
            >
              <Send className="mr-2 h-4 w-4" />
              {isInternal ? 'Post Internal Note' : 'Post Comment'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Sign in to leave a comment.
        </p>
      )}
    </div>
  );
}

function CommentItem({
  comment,
  isTeamMember,
  onReply,
}: {
  comment: Comment;
  isTeamMember: boolean;
  onReply?: () => void;
}) {
  return (
    <div
      className={`rounded-lg p-4 ${
        comment.isInternal
          ? 'border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
          : 'bg-muted/50'
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8">
          <AvatarImage src={comment.author.image ?? undefined} />
          <AvatarFallback>
            {comment.author.name?.charAt(0)?.toUpperCase() ?? '?'}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {comment.author.name ?? 'Anonymous'}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(new Date(comment.createdAt))}
            </span>
            {comment.isInternal && (
              <Badge
                variant="outline"
                className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400"
              >
                <Lock className="mr-1 h-3 w-3" />
                Internal
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>
          {onReply && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 h-7 px-2 text-xs text-muted-foreground"
              onClick={onReply}
            >
              <Reply className="mr-1 h-3 w-3" />
              Reply
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
