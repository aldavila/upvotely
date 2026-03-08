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
  teamId: string;
  notifyOnNewPost: boolean;
  notifyOnStatusChange: boolean;
  notifyOnVoteMilestone: boolean;
  voteMilestones: number[];
}

export default function SlackIntegrationPage() {
  const [config, setConfig] = useState<SlackConfig>({
    webhookUrl: '',
    channel: '',
    teamId: '',
    notifyOnNewPost: true,
    notifyOnStatusChange: true,
    notifyOnVoteMilestone: true,
    voteMilestones: [10, 25, 50, 100],
  });
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/integrations/slack')
      .then((res) => res.json())
      .then((data) => {
        if (data.integration) {
          setConfig(data.integration.config as SlackConfig);
          setIsConnected(data.integration.isActive);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) setIsConnected(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/integrations/slack', { method: 'DELETE' });
    setIsConnected(false);
    setConfig({ webhookUrl: '', channel: '', teamId: '', notifyOnNewPost: true, notifyOnStatusChange: true, notifyOnVoteMilestone: true, voteMilestones: [10, 25, 50, 100] });
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
            <Label htmlFor="teamId">Team ID (for slash commands)</Label>
            <Input
              id="teamId"
              placeholder="T0123456789"
              value={config.teamId}
              onChange={(e) => setConfig({ ...config, teamId: e.target.value })}
            />
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
