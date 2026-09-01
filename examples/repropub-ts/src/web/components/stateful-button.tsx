/**
 * Adapted from starc007/ui-components StatefulButton (MIT).
 * Source: components/motion/button/stateful.tsx
 */
import { Check, LoaderCircle, Play, RotateCcw, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@/components/ui/button";

export type ButtonState = "idle" | "loading" | "success" | "error";

interface StatefulButtonProps extends Omit<ButtonProps, "children"> {
  readonly state: ButtonState;
  readonly children: ReactNode;
  readonly loadingText?: ReactNode;
  readonly successText?: ReactNode;
  readonly errorText?: ReactNode;
}

const labels: Record<ButtonState, ReactNode> = {
  idle: "Run verified demo",
  loading: "Running witness",
  success: "Run completed",
  error: "Run again",
};

export function StatefulButton({
  state,
  children,
  loadingText,
  successText,
  errorText,
  disabled,
  ...props
}: StatefulButtonProps) {
  const reduceMotion = useReducedMotion();
  const label =
    state === "loading"
      ? (loadingText ?? labels.loading)
      : state === "success"
        ? (successText ?? labels.success)
        : state === "error"
          ? (errorText ?? labels.error)
          : children;
  const Icon = state === "loading" ? LoaderCircle : state === "success" ? Check : state === "error" ? X : Play;

  return (
    <Button {...props} disabled={disabled || state === "loading"} aria-busy={state === "loading"}>
      <span className="stateful-button" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={`${state}-icon`}
            className="stateful-button__icon"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.65, filter: "blur(5px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.65, filter: "blur(5px)" }}
            transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 480, damping: 30 }}
          >
            <Icon className={state === "loading" ? "spin" : undefined} aria-hidden="true" />
          </motion.span>
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${state}-${String(label)}`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(5px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, filter: "blur(5px)" }}
            transition={reduceMotion ? { duration: 0.12 } : { type: "spring", stiffness: 420, damping: 31 }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </span>
    </Button>
  );
}

export function ResetRunButton(props: ButtonProps) {
  return (
    <Button variant="ghost" size="compact" {...props}>
      <RotateCcw aria-hidden="true" />
      Reset view
    </Button>
  );
}
