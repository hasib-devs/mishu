"use client";

import * as React from "react";
import {
  CheckIcon,
  CopyIcon,
  RotateCcwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getFeedback,
  setFeedback,
  type FeedbackVote,
} from "@/lib/chat-feedback";

type MessageActionsProps = {
  text: string;
  threadId: string | null;
  messageId: string;
  canRegenerate: boolean;
  onRegenerate: () => void;
};

export function MessageActions({
  text,
  threadId,
  messageId,
  canRegenerate,
  onRegenerate,
}: MessageActionsProps) {
  const storageThread = threadId ?? "draft";
  const [copied, setCopied] = React.useState(false);
  const [vote, setVote] = React.useState<FeedbackVote | null>(() =>
    getFeedback(storageThread, messageId),
  );

  React.useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  function toggleVote(next: FeedbackVote) {
    const value = vote === next ? null : next;
    setVote(value);
    setFeedback(storageThread, messageId, value);
  }

  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={copied ? "Copied" : "Copy response"}
              onClick={() => {
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setCopied(true))
                  .catch(() => undefined);
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          }
        />
        <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
      </Tooltip>

      {canRegenerate ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Regenerate response"
                onClick={onRegenerate}
              >
                <RotateCcwIcon />
              </Button>
            }
          />
          <TooltipContent>Regenerate</TooltipContent>
        </Tooltip>
      ) : null}

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Good response"
              aria-pressed={vote === "up"}
              className={vote === "up" ? "text-primary" : undefined}
              onClick={() => toggleVote("up")}
            >
              <ThumbsUpIcon />
            </Button>
          }
        />
        <TooltipContent>Good response</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Bad response"
              aria-pressed={vote === "down"}
              className={vote === "down" ? "text-primary" : undefined}
              onClick={() => toggleVote("down")}
            >
              <ThumbsDownIcon />
            </Button>
          }
        />
        <TooltipContent>Bad response</TooltipContent>
      </Tooltip>
    </div>
  );
}
