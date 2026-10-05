import type { AIResult } from "./lib/ai";

type AssignmentSnapshot = {
  status: "running" | "done" | "error";
  result?: AIResult;
  error?: Error;
};
type Listener = (snapshot: AssignmentSnapshot) => void;
type Job = AssignmentSnapshot & { listeners: Set<Listener>; promise: Promise<AIResult> };

const jobs = new Map<string, Job>();

export function assignmentJobKey(transcriptId: string, userId: string | null) {
  return `${userId ?? "anonymous"}:${transcriptId}`;
}

export function getAssignmentJob(key: string) {
  return jobs.get(key);
}

export function startAssignmentJob(
  key: string,
  request: () => Promise<AIResult>,
) {
  const existing = jobs.get(key);
  if (existing?.status === "running") return existing;
  let resolvePromise: (result: AIResult) => void = () => {};
  let rejectPromise: (error: Error) => void = () => {};
  const promise = new Promise<AIResult>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const job: Job = { status: "running", listeners: new Set(), promise };
  jobs.set(key, job);
  void request().then(
    (result) => {
      job.status = "done";
      job.result = result;
      resolvePromise(result);
      for (const listener of job.listeners) listener(job);
    },
    (error: unknown) => {
      job.status = "error";
      job.error = error instanceof Error ? error : new Error(String(error));
      rejectPromise(job.error);
      for (const listener of job.listeners) listener(job);
    },
  );
  return job;
}

export function subscribeAssignmentJob(key: string, listener: Listener) {
  const job = jobs.get(key);
  if (!job) return () => {};
  job.listeners.add(listener);
  listener(job);
  return () => job.listeners.delete(listener);
}

export function clearAssignmentJob(key: string) {
  jobs.delete(key);
}
