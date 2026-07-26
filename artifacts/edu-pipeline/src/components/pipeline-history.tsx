import React from 'react';
import {
  PipelineRunSummary,
} from '@workspace/api-client-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Clock, GraduationCap, CheckCircle2, XCircle } from 'lucide-react';

interface PipelineHistoryProps {
  runs: PipelineRunSummary[];
  onSelect: (id: number) => void;
  selectedId: number | null;
  isLoading: boolean;
}

export function PipelineHistory({ runs, onSelect, selectedId, isLoading }: PipelineHistoryProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-3">
        <Clock className="h-8 w-8 opacity-20" />
        <p className="text-sm">No pipeline runs yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {runs.map((run, i) => {
        const isSelected = run.id === selectedId;
        const pass = run.reviewStatus === 'pass';
        
        return (
          <button
            key={run.id}
            onClick={() => onSelect(run.id)}
            className={cn(
              "text-left p-4 border-b border-border transition-colors hover:bg-muted/50 relative group",
              isSelected && "bg-muted/80 hover:bg-muted/80",
              `animate-in-slide-up stagger-${(i % 5) + 1}`
            )}
            style={{ animationDelay: `${i * 50}ms` }}
          >
            {isSelected && (
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
            )}
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <GraduationCap className="h-3 w-3" />
                <span>Grade {run.grade}</span>
                <span className="opacity-50">&bull;</span>
                <span>{format(new Date(run.createdAt), 'MMM d, h:mm a')}</span>
              </div>
              <Badge variant={pass ? "success" : "fail"} className="text-[10px] px-1.5 h-4">
                {pass ? 'Pass' : 'Fail'}
              </Badge>
            </div>
            
            <h4 className="text-sm font-semibold text-foreground line-clamp-2 leading-tight mb-2">
              {run.topic}
            </h4>
            
            <div className="flex items-center gap-2 text-xs">
              {run.refinementApplied ? (
                <Badge variant="secondary" className="text-[10px] font-normal text-muted-foreground">
                  Refined
                </Badge>
              ) : null}
              {run.durationMs && (
                <span className="text-muted-foreground ml-auto">
                  {(run.durationMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
