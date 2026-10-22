import { useEffect, useState } from "react";
import { useMutation, useMutationState, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

// These are UI wait limits, not cancellation or server execution deadlines.
const READ_WAIT_MS = 15_000;
const COLLECTION_WAIT_MS = 90_000;
const COLLECTION_KEY = ["theory-evidence-collection"];

export function readTheoryWithDeadline<T>(read: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Theory read timed out after 15 seconds. Retry the read.")), READ_WAIT_MS);
    Promise.resolve().then(read).then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

export function useTheoryCollection() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationKey: COLLECTION_KEY,
    mutationFn: () => api.runTheoryDiscovery({ trigger: "manual" }),
    retry: false,
    onSettled: () => {
      // Do not keep the write pending while these independent reads finish.
      void qc.invalidateQueries({ queryKey: ["theory-watch"] });
      void qc.invalidateQueries({ queryKey: ["agent-cross-synthesis"] });
    },
  });
  // Read the shared cache so navigating away and back cannot start a duplicate
  // while this browser session still has an unresolved collection request.
  const attempts = useMutationState({
    filters: { mutationKey: COLLECTION_KEY, exact: true },
    select: item => ({
      status: item.state.status,
      submittedAt: item.state.submittedAt,
      data: item.state.data as Awaited<ReturnType<typeof api.runTheoryDiscovery>> | undefined,
      error: item.state.error,
    }),
  });
  const latest = attempts[attempts.length - 1];
  const pending = latest?.status === "pending";
  const submittedAt = latest?.submittedAt ?? 0;
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (!pending) return;
    const remaining = Math.max(0, COLLECTION_WAIT_MS - (Date.now() - submittedAt));
    const timer = setTimeout(() => setSlow(true), remaining);
    return () => clearTimeout(timer);
  }, [pending, submittedAt]);
  return {
    ...latest,
    isPending: pending,
    slow,
    mutate: () => {
      // Guard synchronous double clicks as well as disabled-button renders.
      if (!qc.getMutationCache().find({ mutationKey: COLLECTION_KEY, exact: true, status: "pending" })) mutation.mutate();
    },
  };
}
