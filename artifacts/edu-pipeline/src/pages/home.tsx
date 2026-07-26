import React, { useState } from 'react';
import { 
  useRunPipeline, 
  useListPipelineRuns, 
  useGetPipelineRun,
  getListPipelineRunsQueryKey,
  getGetPipelineRunQueryKey,
  type PipelineRun,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { PipelineHistory } from '@/components/pipeline-history';
import { GeneratorStage, ReviewerStage, RefinedStage } from '@/components/pipeline-stage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Sparkles, BookOpen, Layers, XCircle } from 'lucide-react';

export default function Home() {
  const queryClient = useQueryClient();
  const [grade, setGrade] = useState<number>(6);
  const [topic, setTopic] = useState<string>('');
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  // Queries
  const { data: historyRuns, isLoading: isHistoryLoading } = useListPipelineRuns({ limit: 20 });
  const { data: selectedRun, isLoading: isRunLoading } = useGetPipelineRun(selectedRunId!, {
    query: {
      enabled: !!selectedRunId,
      queryKey: getGetPipelineRunQueryKey(selectedRunId!),
    }
  });

  // Mutations
  const runPipeline = useRunPipeline();

  const handleRunPipeline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;

    setSelectedRunId(null); // Clear selection to show live loading
    runPipeline.mutate({ data: { grade, topic } }, {
      onSuccess: (data: PipelineRun) => {
        queryClient.invalidateQueries({ queryKey: getListPipelineRunsQueryKey() });
        setSelectedRunId(data.id);
      }
    });
  };

  const isPipelineRunning = runPipeline.isPending;
  const pipelineError = runPipeline.error;

  // Extract a readable error message from the react-query error
  const errorMessage = (() => {
    if (!pipelineError) return null;
    const err = pipelineError as { data?: { error?: string }; status?: number };
    if (err.data?.error) return err.data.error;
    return "An unexpected error occurred. Please try again.";
  })();

  // Render variables
  const showLiveLoading = isPipelineRunning && !selectedRunId;
  const showResults = !!selectedRun || showLiveLoading;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden font-sans">
      
      {/* Sidebar History */}
      <div className="w-full md:w-80 border-r border-border bg-card/30 flex flex-col h-[100dvh] shrink-0">
        <div className="p-4 border-b border-border bg-card flex items-center gap-3 shrink-0">
          <div className="h-8 w-8 bg-primary text-primary-foreground rounded-lg flex items-center justify-center shrink-0 shadow-sm">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight">AI EduPipeline</h1>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Multi-Agent Workflow</p>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 bg-card/95 backdrop-blur z-10 border-b border-border/50">
            Recent Runs
          </div>
          <PipelineHistory 
            runs={historyRuns || []} 
            onSelect={setSelectedRunId} 
            selectedId={selectedRunId}
            isLoading={isHistoryLoading}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-[100dvh] overflow-hidden bg-background/50">
        
        {/* Control Panel */}
        <div className="bg-card border-b border-border p-6 shadow-sm z-10 shrink-0">
          <form onSubmit={handleRunPipeline} className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-4 items-end">
            <div className="w-full sm:w-24 shrink-0 space-y-1.5">
              <Label htmlFor="grade" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grade</Label>
              <select 
                id="grade"
                value={grade}
                onChange={(e) => setGrade(Number(e.target.value))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isPipelineRunning}
              >
                {[...Array(12)].map((_, i) => (
                  <option key={i+1} value={i+1}>Grade {i+1}</option>
                ))}
              </select>
            </div>
            
            <div className="w-full space-y-1.5">
              <Label htmlFor="topic" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Topic</Label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="topic"
                  placeholder="e.g. The Water Cycle, Fractions, Ancient Rome..." 
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="pl-9 font-medium"
                  disabled={isPipelineRunning}
                />
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full sm:w-auto shrink-0 shadow-md font-semibold tracking-wide"
              disabled={!topic.trim() || isPipelineRunning}
            >
              {isPipelineRunning ? (
                <>
                  <div className="h-4 w-4 mr-2 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  Running Agents...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Run Pipeline
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="bg-destructive/10 border-b border-destructive/30 px-6 py-3 flex items-start gap-3 text-sm text-destructive shrink-0">
            <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Pipeline Visualization */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
          <div className="max-w-4xl mx-auto">
            {!showResults ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground min-h-[40vh]">
                <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-4">
                  <Play className="h-8 w-8 opacity-50" />
                </div>
                <h3 className="text-lg font-medium text-foreground">Ready to generate</h3>
                <p className="text-sm max-w-sm text-center mt-2">
                  Enter a topic and grade level to watch the AI teacher and reviewer agents collaborate.
                </p>
              </div>
            ) : (
              <div className="space-y-8 pb-12">
                {selectedRun ? (
                  <>
                    <div className="mb-8">
                      <h2 className="text-2xl font-bold font-serif">{selectedRun.topic}</h2>
                      <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                        <span className="font-medium bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md">
                          Grade {selectedRun.grade}
                        </span>
                        <span>&bull;</span>
                        <span>Completed in {selectedRun.durationMs ? (selectedRun.durationMs / 1000).toFixed(2) : '-'}s</span>
                      </div>
                    </div>
                    
                    <GeneratorStage data={selectedRun.generatorOutput} />
                    
                    <ReviewerStage data={selectedRun.reviewerOutput} />
                    
                    {selectedRun.refinementApplied && selectedRun.refinedOutput && (
                      <RefinedStage data={selectedRun.refinedOutput} />
                    )}
                  </>
                ) : (
                  <>
                    <div className="mb-8 animate-pulse">
                      <div className="h-8 w-64 bg-muted/60 rounded-md mb-2"></div>
                      <div className="h-5 w-32 bg-muted/40 rounded-md"></div>
                    </div>
                    {/* Simulated live pipeline progress */}
                    <GeneratorStage isLoading={true} />
                    <div className="opacity-40 pointer-events-none mt-6">
                      <ReviewerStage isLoading={true} />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
