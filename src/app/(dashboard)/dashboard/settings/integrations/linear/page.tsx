'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Zap } from 'lucide-react';

export default function LinearIntegrationPage() {
  const [config, setConfig] = useState({ apiKey: '', teamId: '' });
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/integrations/linear')
      .then((res) => res.json())
      .then((data) => {
        if (data.integration) {
          const cfg = data.integration.config as { teamId: string };
          setConfig({ apiKey: '', teamId: cfg.teamId || '' });
          setIsConnected(data.integration.isActive);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/linear', {
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
    await fetch('/api/integrations/linear', { method: 'DELETE' });
    setIsConnected(false);
    setConfig({ apiKey: '', teamId: '' });
  };

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/linear/webhook` : '';

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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#5E6AD2]">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Linear Integration</h1>
            <p className="text-sm text-muted-foreground">Create issues and sync status with Linear</p>
          </div>
        </div>
        <Badge variant={isConnected ? 'default' : 'secondary'}>
          {isConnected ? 'Connected' : 'Not Connected'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>Configure your Linear API connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="lin_api_..."
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">Your Linear API key</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="teamId">Team ID</Label>
            <Input
              id="teamId"
              placeholder="Team ID from Linear"
              value={config.teamId}
              onChange={(e) => setConfig({ ...config, teamId: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">The Linear team to create issues in</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>Add this URL to your Linear webhook settings for status sync</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-sm" />
            <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(webhookUrl)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving || !config.apiKey || !config.teamId}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Configuration
        </Button>
        {isConnected && (
          <Button variant="outline" onClick={handleDisconnect}>Disconnect</Button>
        )}
      </div>
    </div>
  );
}
