/**
 * Adapted from starc007/ui-components AgentActivity (MIT).
 * Source: components/agents/agent-activity/index.tsx
 */
import { Check, ChevronDown, Circle, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useState } from "react";

import type { DashboardActivity } from "../../shared/dashboard";
import { cn } from "@/lib";

interface AgentActivityProps {
  readonly items: readonly DashboardActivity[];
  readonly status: "idle" | "running" | "complete" | "error";
}

function StepIcon({ status }: { readonly status: DashboardActivity["status"] }) {
  if (status === "complete") return <Check aria-hidden="true" />;
  if (status === "active") return <LoaderCircle className="spin" aria-hidden="true" />;
  if (status === "error") return <X aria-hidden="true" />;
  return <Circle aria-hidden="true" />;
}

export function AgentActivity({ items, status }: AgentActivityProps) {
  const reduceMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(true);
  const completed = items.filter((item) => item.status === "complete").length;
  const active = items.find((item) => item.status === "active");
  const heading =
    status === "running"
      ? (active?.label ?? "Preparing the witness")
      : status === "complete"
        ? "Evidence bundle ready"
        : status === "error"
          ? "The run stopped safely"
          : "Ready to inspect the publication";
  const summary = useMemo(() => {
    if (status === "idle") return "No run yet";
    if (status === "running") return `${completed}/${items.length} stages verified`;
    if (status === "complete") return `${items.length}/${items.length} stages verified`;
    return `${completed}/${items.length} stages completed before the failure`;
  }, [completed, items.length, status]);

  return (
    <div className={cn("agent-activity", `agent-activity--${status}`)}>
      <button
        type="button"
        className="agent-activity__summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="agent-activity__summary-icon" aria-hidden="true">
          {status === "running" ? <LoaderCircle className="spin" /> : status === "error" ? <TriangleAlert /> : <Check />}
        </span>
        <span className="agent-activity__summary-copy">
          <strong>{heading}</strong>
          <span>{summary}</span>
        </span>
        <ChevronDown className={cn("agent-activity__chevron", expanded && "agent-activity__chevron--open")} aria-hidden="true" />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.ol
            className="agent-activity__steps"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduceMotion ? { duration: 0.12 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            {items.map((item, index) => (
              <motion.li
                key={item.id}
                className={cn("agent-step", `agent-step--${item.status}`)}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduceMotion ? 0 : index * 0.035 }}
              >
                <span className="agent-step__rail" aria-hidden="true">
                  <span className="agent-step__icon"><StepIcon status={item.status} /></span>
                  {index < items.length - 1 ? <span className="agent-step__line" /> : null}
                </span>
                <span className="agent-step__copy">
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </span>
              </motion.li>
            ))}
          </motion.ol>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
