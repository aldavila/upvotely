'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Github, Loader2, Copy } from 'lucide-react';

interface GitHubConfig {
  accessToken: string;
  owner: string;
  repo: string;
  defaultLabels: string[];
}

export default function GitHubIntegrationPage() {
  const [config, setConfig] = useState<GitHubConfig>({
    accessToken: '',
    owner: '',
    repo: '',
    defaultLabels: [],
  });
  const [labelsInput, setLabelsInput] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/integrations/github')
      .then((res) => res.json())
      .then((data) => {
        if (data.integration) {
          const cfg = data.integration.config as GitHubConfig;
          setConfig({ ...cfg, accessToken: '' });
          setLabelsInput((cfg.defaultLabels || []).join(', '));
          setIsConnected(data.integration.isActive);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          defaultLabels: labelsInput.split(',').map((l) => l.trim()).filter(Boolean),
        }),
      });
      if (res.ok) setIsConnected(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    await fetch('/api/integrations/github', { method: 'DELETE' });
    setIsConnected(false);
    setConfig({ accessToken: '', owner: '', repo: '', defaultLabels: [] });
    setLabelsInput('');
  };

  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/integrations/github/webhook` : '';

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
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#24292f]">
            <Github className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">GitHub Integration</h1>
            <p className="text-sm text-muted-foreground">Create issues and sync status with GitHub</p>
          </div>
        </div>
        <Badge variant={isConnected ? 'default' : 'secondary'}>
          {isConnected ? 'Connected' : 'Not Connected'}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
          <CardDescription>Configure your GitHub repository connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="accessToken">Personal Access Token</Label>
            <Input
              id="accessToken"
              type="password"
              placeholder="ghp_..."
              value={config.accessToken}
              onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">GitHub PAT with repo scope</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="owner">Repository Owner</Label>
              <Input
                id="owner"
                placeholder="octocat"
                value={config.owner}
                onChange={(e) => setConfig({ ...config, owner: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo">Repository Name</Label>
              <Input
                id="repo"
                placeholder="my-project"
                value={config.repo}
                onChange={(e) => setConfig({ ...config, repo: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="labels">Default Labels (comma-separated)</Label>
            <Input
              id="labels"
              placeholder="feedback, upvotely"
              value={labelsInput}
              onChange={(e) => setLabelsInput(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook URL</CardTitle>
          <CardDescription>Add this URL to your GitHub repository webhook settings to sync issue status</CardDescription>
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
        <Button onClick={handleSave} disabled={saving || !config.accessToken || !config.owner || !config.repo}>
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
