import assert from "node:assert/strict";
import test from "node:test";

import { runtimeConsole } from "./runtime-console.ts";

test("production browser console is silent while server errors remain available", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWindow = globalThis.window;
  const originalInfo = console.info;
  const originalError = console.error;
  const calls = [];

  process.env.NODE_ENV = "production";
  console.info = (...args) => calls.push(["info", ...args]);
  console.error = (...args) => calls.push(["error", ...args]);

  try {
    globalThis.window = {};
    runtimeConsole.info("browser-info");
    runtimeConsole.error("browser-error");
    assert.deepEqual(calls, []);

    delete globalThis.window;
    runtimeConsole.info("server-info");
    runtimeConsole.error("server-error");
    assert.deepEqual(calls, [["error", "server-error"]]);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    console.info = originalInfo;
    console.error = originalError;
  }
});
