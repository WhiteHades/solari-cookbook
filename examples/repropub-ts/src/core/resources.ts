export interface ManagedResource {
  readonly kind: string;
  readonly id: string;
  close(): Promise<void>;
}

export interface CleanupReceipt {
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly failures: readonly { readonly kind: string; readonly id: string; readonly message: string }[];
}

interface ResourceScope {
  register(resource: ManagedResource): void;
}

export async function withRunResources<T>(
  task: (scope: ResourceScope) => Promise<T>,
): Promise<{ readonly value: T; readonly cleanup: CleanupReceipt }> {
  const resources: ManagedResource[] = [];
  let accepting = true;
  const scope: ResourceScope = {
    register(resource) {
      if (!accepting) throw new Error("cannot register a resource after cleanup has started");
      resources.push(resource);
    },
  };

  let value: T | undefined;
  let taskError: unknown;
  try {
    value = await task(scope);
  } catch (error) {
    taskError = error;
  }

  accepting = false;
  const failures: { kind: string; id: string; message: string }[] = [];
  let succeeded = 0;
  for (const resource of [...resources].reverse()) {
    try {
      await resource.close();
      succeeded += 1;
    } catch (error) {
      failures.push({
        kind: resource.kind,
        id: resource.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const cleanup: CleanupReceipt = {
    attempted: resources.length,
    succeeded,
    failed: failures.length,
    failures,
  };

  if (taskError !== undefined) throw taskError;
  if (value === undefined) throw new Error("resource-scoped task completed without a value");
  return { value, cleanup };
}
