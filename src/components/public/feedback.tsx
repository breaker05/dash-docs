"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Stage = "idle" | "comment" | "done";

export function PageFeedback({ pageId }: { pageId: string }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);

  // soft dedupe: remember votes per page in this browser. Reading localStorage
  // must happen after hydration (not in a lazy initializer) or the server HTML
  // and first client render disagree — the effect is the correct pattern here.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(`voted:${pageId}`)) setStage("done");
    } catch {
      // storage unavailable — voting still works
    }
  }, [pageId]);

  async function send(helpful: boolean, text?: string) {
    setSending(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId, helpful, comment: text }),
      });
      try {
        window.localStorage.setItem(`voted:${pageId}`, "1");
      } catch {
        // ignore
      }
      setStage("done");
    } finally {
      setSending(false);
    }
  }

  if (stage === "done") {
    return (
      <div className="mt-12 rounded-xl border border-dashed px-5 py-4 text-sm text-muted-foreground">
        Thanks for the feedback — it helps us decide what to improve next.
      </div>
    );
  }

  return (
    <div className="mt-12 rounded-xl border px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">Was this page helpful?</p>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={sending}
            onClick={() => send(true)}
            aria-label="Yes, this page was helpful"
          >
            <ThumbsUp className="size-3.5" /> Yes
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sending}
            className={cn(stage === "comment" && "bg-accent")}
            onClick={() => setStage("comment")}
            aria-label="No, this page was not helpful"
          >
            <ThumbsDown className="size-3.5" /> No
          </Button>
        </div>
      </div>
      {stage === "comment" && (
        <div className="mt-3 space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What were you looking for? (optional)"
            className="min-h-20 text-sm"
            maxLength={2000}
          />
          <Button
            size="sm"
            disabled={sending}
            onClick={() => send(false, comment)}
          >
            Send feedback
          </Button>
        </div>
      )}
    </div>
  );
}
