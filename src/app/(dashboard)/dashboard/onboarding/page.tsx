'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Check } from 'lucide-react';
import { slugify } from '@/lib/utils';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [orgData, setOrgData] = useState({
    name: '',
    slug: '',
    description: '',
  });
  const [boardData, setBoardData] = useState({
    name: 'Feature Requests',
    slug: 'feature-requests',
    description: 'Share your ideas and vote on features you want to see.',
  });

  const handleOrgNameChange = (name: string) => {
    setOrgData({
      ...orgData,
      name,
      slug: slugify(name),
    });
  };

  const handleBoardNameChange = (name: string) => {
    setBoardData({
      ...boardData,
      name,
      slug: slugify(name),
    });
  };

  const handleSubmit = async () => {
    setIsLoading(true);

    try {
      // Create organization
      const orgRes = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orgData),
      });

      if (!orgRes.ok) {
        const error = await orgRes.json();
        throw new Error(error.error || 'Failed to create organization');
      }

      // Create first board
      const boardRes = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boardData),
      });

      if (!boardRes.ok) {
        const error = await boardRes.json();
        throw new Error(error.error || 'Failed to create board');
      }

      toast({
        title: 'Setup complete!',
        description: 'Your workspace is ready to go.',
      });

      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* Progress */}
      <div className="mb-8 flex items-center justify-center gap-4">
        <StepIndicator step={1} currentStep={step} label="Organization" />
        <div className="h-px w-12 bg-border" />
        <StepIndicator step={2} currentStep={step} label="First Board" />
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Create your organization</CardTitle>
            <CardDescription>
              This is your workspace where you'll manage all your feedback boards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                placeholder="Acme Inc"
                value={orgData.name}
                onChange={(e) => handleOrgNameChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">upvotely.io/</span>
                <Input
                  id="org-slug"
                  placeholder="acme"
                  value={orgData.slug}
                  onChange={(e) => setOrgData({ ...orgData, slug: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="org-desc">Description (optional)</Label>
              <Textarea
                id="org-desc"
                placeholder="A brief description of your organization..."
                value={orgData.description}
                onChange={(e) => setOrgData({ ...orgData, description: e.target.value })}
              />
            </div>
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              disabled={!orgData.name || !orgData.slug}
            >
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Create your first board</CardTitle>
            <CardDescription>
              Boards are where your users submit and vote on feedback.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="board-name">Board Name</Label>
              <Input
                id="board-name"
                placeholder="Feature Requests"
                value={boardData.name}
                onChange={(e) => handleBoardNameChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="board-slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  upvotely.io/{orgData.slug}/
                </span>
                <Input
                  id="board-slug"
                  placeholder="feature-requests"
                  value={boardData.slug}
                  onChange={(e) => setBoardData({ ...boardData, slug: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="board-desc">Description (optional)</Label>
              <Textarea
                id="board-desc"
                placeholder="What is this board for?"
                value={boardData.description}
                onChange={(e) => setBoardData({ ...boardData, description: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSubmit}
                disabled={isLoading || !boardData.name || !boardData.slug}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Complete Setup
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StepIndicator({
  step,
  currentStep,
  label,
}: {
  step: number;
  currentStep: number;
  label: string;
}) {
  const isComplete = currentStep > step;
  const isActive = currentStep === step;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
          isComplete
            ? 'bg-primary text-primary-foreground'
            : isActive
            ? 'border-2 border-primary text-primary'
            : 'border-2 border-muted text-muted-foreground'
        }`}
      >
        {isComplete ? <Check className="h-4 w-4" /> : step}
      </div>
      <span className={`text-xs ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  );
}
