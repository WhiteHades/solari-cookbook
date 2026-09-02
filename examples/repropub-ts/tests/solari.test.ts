import assert from "node:assert/strict";
import test from "node:test";

import { createSyntheticPublication, createSyntheticScenario } from "../src/core/fixture.js";
import {
  SolariApiError,
  runSolariWitness,
  type BrowserClientPort,
  type BrowserClientFactory,
  type BrowserPagePort,
  type BrowserSessionPort,
} from "../src/core/solari.js";

interface FetchCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: string | undefined;
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createGatewayFetch(options: { transientCreate?: boolean; createStatus?: number } = {}) {
  const calls: FetchCall[] = [];
  let createCalls = 0;
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init.method ?? "GET";
    const headers = new Headers(init.headers);
    const body = typeof init.body === "string" ? init.body : undefined;
    calls.push({ url, method, headers, body });

    if (url === "https://api.getsolari.com/sandboxes" && method === "POST") {
      createCalls += 1;
      if (options.transientCreate && createCalls === 1) {
        return jsonResponse({ code: "NoCapacity", message: "try again" }, 503);
      }
      if (options.createStatus) {
        return jsonResponse({ code: "ConcurrencyLimitExceeded", message: "full" }, options.createStatus);
      }
      return jsonResponse({ sandboxId: "sbx-secret-capability", kind: "sandbox" }, 201);
    }

    if (url.includes("/exec") && method === "POST") {
      const payload = JSON.parse(body ?? "{}") as { cmd?: string; args?: string[] };
      if (payload.cmd === "sh") return jsonResponse({ exitCode: 0, stdout: "4321\n", stderr: "" });
      return jsonResponse({ exitCode: 0, stdout: "", stderr: "" });
    }

    if (url.includes("/files/upload-url") && method === "GET") {
      return jsonResponse({ url: `https://api.getsolari.com/files/upload?token=upload-secret-${calls.length}` });
    }

    if (url.startsWith("https://api.getsolari.com/files/upload?") && method === "PUT") {
      return new Response(null, { status: 204 });
    }

    if (url.includes("/ports/3000") && method === "GET") {
      return jsonResponse({
        url: "https://fixture-3000.preview.getsolari.com",
        token: "preview-secret-token",
      });
    }

    if (url.startsWith("https://fixture-3000.preview.getsolari.com") && method === "GET") {
      return new Response("ok", { status: 200, headers: { "content-type": "text/plain" } });
    }

    if (url.includes("/sandboxes/") && method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    throw new Error(`unexpected fetch ${method} ${url}`);
  };
  return { fetchImpl, calls, get createCalls() { return createCalls; } };
}

function createBrowserFactory(events: string[], options: { failGoto?: boolean; replay404s?: number } = {}) {
  let replayCalls = 0;
  const page: BrowserPagePort = {
    async goto(url) {
      events.push(`goto:${new URL(url).hostname}`);
      if (options.failGoto) throw new Error("browser navigation failed");
    },
    locator(selector) {
      return {
        async click() {
          events.push(`click:${selector}`);
        },
      };
    },
    async evaluate<T>() {
      return {
        navigationLabel: "Synthetic text 1.",
        requestedHref: "chapter-2.xhtml#target%20section",
        requestedFragment: "target%20section",
        lookupFragment: "target%20section",
        targetPath: "EPUB/chapter-2.xhtml",
        observedTargetId: "chapter-2",
        observedHeading: "Synthetic text 1.",
        availableTargetIds: ["chapter-2", "target section"],
      } as T;
    },
    async screenshot() {
      return Buffer.from("png-evidence");
    },
  };

  const session: BrowserSessionPort = {
    id: "browser-secret-session",
    async newPage() {
      events.push("browser:new-page");
      return page;
    },
    async close() {
      events.push("browser:close");
    },
  };

  const client: BrowserClientPort = {
    async launch(options) {
      assert.equal(options.recording, true);
      events.push("browser:launch");
      return session;
    },
    async downloadReplay() {
      replayCalls += 1;
      events.push(`replay:${replayCalls}`);
      if (replayCalls <= (options.replay404s ?? 0)) {
        throw new SolariApiError(404, "ReplayNotReady", "not ready");
      }
      return new Uint8Array(Buffer.from('{"rrweb":true}\n'));
    },
    async close() {
      events.push("browser-client:close");
    },
  };

  const factory: BrowserClientFactory = async () => client;
  return { factory, get replayCalls() { return replayCalls; } };
}

const target = {
  id: "fixture-reader@legacy-fragment-resolver",
  fragmentResolution: "literal" as const,
};

test("fails before provisioning when the Solari key is missing", async () => {
  const gateway = createGatewayFetch();
  const browser = createBrowserFactory([]);

  await assert.rejects(
    runSolariWitness({
      apiKey: "",
      archive: createSyntheticPublication(),
      scenario: createSyntheticScenario(),
      target,
      dependencies: { fetch: gateway.fetchImpl, browserFactory: browser.factory },
    }),
    /SOLARI_API_KEY/,
  );
  assert.equal(gateway.calls.length, 0);
});

test("retries a transient sandbox create, records the browser, and cleans up", async () => {
  const gateway = createGatewayFetch({ transientCreate: true });
  const events: string[] = [];
  const browser = createBrowserFactory(events, { replay404s: 1 });

  const result = await runSolariWitness({
    apiKey: "test-solari-key",
    archive: createSyntheticPublication(),
    scenario: createSyntheticScenario(),
    target,
    dependencies: {
      fetch: gateway.fetchImpl,
      browserFactory: browser.factory,
      sleep: async () => undefined,
      idempotencyKey: () => "same-key-for-retries",
    },
  });

  assert.equal(gateway.createCalls, 2);
  const createRequests = gateway.calls.filter((call) => call.url.endsWith("/sandboxes") && call.method === "POST");
  assert.equal(createRequests[0]?.headers.get("idempotency-key"), "same-key-for-retries");
  assert.equal(createRequests[1]?.headers.get("idempotency-key"), "same-key-for-retries");
  assert.equal(result.witness.verdict, "PRESERVED");
  assert.equal(result.replay.length > 0, true);
  assert.equal(result.screenshot.toString(), "png-evidence");
  assert.equal(result.cleanup.failed, 0);
  assert.equal(events.filter((event) => event === "browser:close").length, 1);
  assert.ok(events.indexOf("browser:close") < events.indexOf("replay:2"));
  assert.equal(events.at(-1), "browser-client:close");
  assert.ok(gateway.calls.some((call) => call.method === "DELETE"));
  assert.ok(!JSON.stringify(result).includes("preview-secret-token"));
  assert.ok(!JSON.stringify(result).includes("browser-secret-session"));
  assert.ok(!JSON.stringify(result).includes("sbx-secret-capability"));
});

test("does not retry a Solari concurrency limit", async () => {
  const gateway = createGatewayFetch({ createStatus: 429 });
  const browser = createBrowserFactory([]);

  await assert.rejects(
    runSolariWitness({
      apiKey: "test-solari-key",
      archive: createSyntheticPublication(),
      scenario: createSyntheticScenario(),
      target,
      dependencies: {
        fetch: gateway.fetchImpl,
        browserFactory: browser.factory,
        sleep: async () => undefined,
      },
    }),
    (error: unknown) => error instanceof SolariApiError && error.status === 429,
  );
  assert.equal(gateway.createCalls, 1);
});

test("closes the browser client and destroys the sandbox after a browser failure", async () => {
  const gateway = createGatewayFetch();
  const events: string[] = [];
  const browser = createBrowserFactory(events, { failGoto: true });

  await assert.rejects(
    runSolariWitness({
      apiKey: "test-solari-key",
      archive: createSyntheticPublication(),
      scenario: createSyntheticScenario(),
      target,
      dependencies: {
        fetch: gateway.fetchImpl,
        browserFactory: browser.factory,
        sleep: async () => undefined,
      },
    }),
    /browser navigation failed/,
  );

  assert.ok(events.includes("browser:close"));
  assert.ok(events.includes("browser-client:close"));
  assert.ok(gateway.calls.some((call) => call.method === "DELETE"));
});
