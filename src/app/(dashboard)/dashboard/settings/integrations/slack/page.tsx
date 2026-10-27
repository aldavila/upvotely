'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Loader2 } from 'lucide-react';

interface SlackConfig {
  webhookUrl: string;
  channel: string;
  notifyOnNewPost: boolean;
  notifyOnStatusChange: boolean;
  notifyOnVoteMilestone: boolean;
  voteMilestones: number[];
}

export default function SlackIntegrationPage() {
  const [config, setConfig] = useState<SlackConfig>({
    webhookUrl: '',
    channel: '',
    notifyOnNewPost: true,
    notifyOnStatusChange: true,
    notifyOnVoteMilestone: true,
    voteMilestones: [10, 25, 50, 100],
  });
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [connectionCode, setConnectionCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/integrations/slack')
      .then((res) => res.json())
      .then((data) => {
        if (data.integration) {
          setConfig(data.integration.config as SlackConfig);
          setIsConnected(data.integration.isActive);
          setWorkspaceId(data.integration.slackTeamId);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setIsConnected(true);
      setWorkspaceId(data.integration.slackTeamId);
      setConnectionCode(data.connectionCode || '');
    } catch {
      setError('Could not save the integration. Check the webhook URL and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setError('');
    try {
      const res = await fetch('/api/integrations/slack', { method: 'DELETE' });
      if (!res.ok) throw new Error('Disconnect failed');
      setIsConnected(false);
      setWorkspaceId(null);
      setConnectionCode('');
      setConfig({ webhookUrl: '', channel: '', notifyOnNewPost: true, notifyOnStatusChange: true, notifyOnVoteMilestone: true, voteMilestones: [10, 25, 50, 100] });
    } catch {
      setError('Could not disconnect. Please try again.');
    }
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#4A154B]">
            <MessageSquare className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Slack Integration</h1>
            <p className="text-sm text-muted-foreground">Send notifications and create feedback from Slack</p>
          </div>
        </div>
        <Badge variant={isConnected ? 'default' : 'secondary'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>Configure your Slack Incoming Webhook</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              placeholder="https://hooks.slack.com/services/..."
              value={config.webhookUrl}
              onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Your Slack Incoming Webhook URL</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="channel">Channel (optional)</Label>
            <Input
              id="channel"
              placeholder="#feedback"
              value={config.channel}
              onChange={(e) => setConfig({ ...config, channel: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Slash command workspace</Label>
            {workspaceId ? <p className="text-sm">Verified workspace: {workspaceId}</p> : (
              <>
                <p className="text-sm">Save the configuration, then run this command in your Slack workspace within 10 minutes. Keep the code private.</p>
                {connectionCode && <code className="block break-all text-sm">/upvotely connect {connectionCode}</code>}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
          <CardDescription>Choose which events send Slack notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">New post notifications</p>
              <p className="text-sm text-muted-foreground">Notify when new feedback is submitted</p>
            </div>
            <Switch
              checked={config.notifyOnNewPost}
              onCheckedChange={(checked) => setConfig({ ...config, notifyOnNewPost: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Status change notifications</p>
              <p className="text-sm text-muted-foreground">Notify when post status changes</p>
            </div>
            <Switch
              checked={config.notifyOnStatusChange}
              onCheckedChange={(checked) => setConfig({ ...config, notifyOnStatusChange: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Vote milestone notifications</p>
              <p className="text-sm text-muted-foreground">Notify when posts reach vote milestones</p>
            </div>
            <Switch
              checked={config.notifyOnVoteMilestone}
              onCheckedChange={(checked) => setConfig({ ...config, notifyOnVoteMilestone: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || !config.webhookUrl}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Configuration
        </Button>
        {isConnected && (
          <Button variant="outline" onClick={handleDisconnect}>
            Disconnect
          </Button>
        )}
      </div>
    </div>
  );
}
