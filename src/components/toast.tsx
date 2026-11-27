"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "error" | "success" | "info";

export interface ToastMessage {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

const ICONS = { error: TriangleAlert, success: CircleCheck, info: Info } as const;
const COLORS = { error: "text-danger", success: "text-success", info: "text-cyan" } as const;

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const push = useCallback(
    (toast: Omit<ToastMessage, "id">) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { ...toast, id }]);
      timers.current.set(id, setTimeout(() => dismiss(id), toast.kind === "error" ? 7000 : 3500));
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  return { toasts, push, dismiss };
}

export function Toaster({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              role={toast.kind === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="glass pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl p-3.5 pr-2.5"
            >
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", COLORS[toast.kind])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{toast.title}</p>
                {toast.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{toast.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="rounded-md p-1 text-muted transition hover:bg-white/10 hover:text-fg"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
