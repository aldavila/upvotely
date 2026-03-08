'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, RefreshCw, Webhook, Copy, Eye, EyeOff } from 'lucide-react';

const EVENT_TYPES = [
  { key: 'post.created', label: 'Post Created' },
  { key: 'post.updated', label: 'Post Updated' },
  { key: 'post.status_changed', label: 'Post Status Changed' },
  { key: 'vote.created', label: 'Vote Created' },
  { key: 'vote.removed', label: 'Vote Removed' },
  { key: 'comment.created', label: 'Comment Created' },
  { key: 'conversation.feedback.created', label: 'Conversation Feedback Created' },
  { key: 'conversation.feedback.negative', label: 'Negative Conversation Feedback' },
  { key: 'post.trending', label: 'Post Trending' },
  { key: 'post.ai_categorized', label: 'Post AI Categorized' },
  { key: 'insight.weekly_summary', label: 'Weekly Summary Insight' },
];

interface WebhookEvent {
  id: string;
  event: string;
  status: string;
  attempts: number;
  response: string | null;
  createdAt: string;
}

export default function WebhooksSettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [hasSecret, setHasSecret] = useState(false);
  const [secretPreview, setSecretPreview] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/webhooks').then((r) => r.json()),
      fetch('/api/webhooks/events?limit=10').then((r) => r.json()),
    ]).then(([config, eventsData]) => {
      setWebhookUrl(config.webhookUrl || '');
      setWebhookEvents(config.webhookEvents || []);
      setHasSecret(config.hasSecret);
      setSecretPreview(config.secretPreview);
      setEvents(eventsData.events || []);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, webhookEvents }),
      });
      if (res.ok) {
        const data = await res.json();
        setHasSecret(data.hasSecret);
        setSecretPreview(data.secretPreview);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerateSecret = async () => {
    const res = await fetch('/api/webhooks', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regenerateSecret: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setHasSecret(data.hasSecret);
      setSecretPreview(data.secretPreview);
    }
  };

  const handleRetry = async (eventId: string) => {
    setRetrying(eventId);
    try {
      await fetch(`/api/webhooks/events/${eventId}/retry`, { method: 'POST' });
      const res = await fetch('/api/webhooks/events?limit=10');
      const data = await res.json();
      setEvents(data.events || []);
    } finally {
      setRetrying(null);
    }
  };

  const toggleEvent = (eventKey: string) => {
    setWebhookEvents((prev) =>
      prev.includes(eventKey) ? prev.filter((e) => e !== eventKey) : [...prev, eventKey]
    );
  };

  const statusColor = (status: string) => {
    if (status === 'sent') return 'default';
    if (status === 'failed') return 'destructive';
    return 'secondary';
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Webhook className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground">Configure webhook notifications for your organization</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>The URL to receive webhook events</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="https://example.com/webhooks/upvotely"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label className="text-sm font-medium">Webhook Secret</Label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={showSecret && secretPreview ? secretPreview : hasSecret ? '••••••••••••••••' : 'No secret configured'}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" onClick={() => setShowSecret(!showSecret)}>
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button variant="outline" className="mt-6" onClick={handleRegenerateSecret}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Regenerate
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event Types</CardTitle>
          <CardDescription>Select which events trigger webhooks. Leave empty to receive all events.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {EVENT_TYPES.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between rounded-lg border p-3">
                <Label className="text-sm">{label}</Label>
                <Switch checked={webhookEvents.includes(key)} onCheckedChange={() => toggleEvent(key)} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Save Configuration
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Delivery Log</CardTitle>
          <CardDescription>Recent webhook delivery attempts</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No webhook events yet</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusColor(event.status) as 'default' | 'destructive' | 'secondary'}>
                        {event.status}
                      </Badge>
                      <span className="text-sm font-medium">{event.event}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
                      <span>Attempts: {event.attempts}</span>
                      <span>{formatTime(event.createdAt)}</span>
                      {event.response && <span className="truncate max-w-xs">{event.response}</span>}
                    </div>
                  </div>
                  {event.status === 'failed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRetry(event.id)}
                      disabled={retrying === event.id}
                    >
                      {retrying === event.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
