// Drives the real app through the Chrome DevTools Protocol of its WebView2.
// Plain Node with its built-in WebSocket, so the scripts need no extra dependency.
import { spawn, execSync } from "node:child_process";

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PORT = 9222;

async function findPage(timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((target) => target.type === "page");
      if (page) {
        return page;
      }
    } catch {
      // The webview is not up yet.
    }
    await wait(250);
  }
  throw new Error("The webview did not expose a debug target in time.");
}

/**
 * Starts the app with a throwaway data folder and connects to it. Returns helpers and `stop`.
 * `dataDir` is required on purpose: an automated run must never write to real journals.
 */
export async function launchApp({ exe, dataDir, timeoutMs = 60000 }) {
  const child = spawn(exe, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      KEYMIND_DATA_DIR: dataDir,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
  });
  const page = await findPage(timeoutMs);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const pending = new Map();
  const problems = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    } else if (message.method === "Runtime.exceptionThrown") {
      problems.push(
        `exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`,
      );
    } else if (
      message.method === "Runtime.consoleAPICalled" &&
      message.params.type === "error"
    ) {
      problems.push(
        `console: ${JSON.stringify(message.params.args.map((arg) => arg.value))}`,
      );
    } else if (
      message.method === "Log.entryAdded" &&
      message.params.entry.level === "error"
    ) {
      problems.push(`log: ${message.params.entry.text}`);
    }
  };
  ws.onclose = () => {
    for (const { reject } of pending.values()) {
      reject(new Error("The app closed the connection."));
    }
    pending.clear();
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });

  /** Runs an expression in the page and returns its JSON value. */
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      );
    }
    return result.value;
  };

  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.enable");

  return {
    child,
    send,
    evaluate,
    problems,
    closeSocket: () => ws.close(),
    /** Ends the process tree, which is also how a crash looks to the journal. */
    kill() {
      try {
        execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
      } catch {
        // Already gone.
      }
    },
  };
}

function descriptor(key) {
  if (key === " ") {
    return { key, code: "Space", windowsVirtualKeyCode: 32 };
  }
  if (/^[a-z]$/.test(key)) {
    const upper = key.toUpperCase();
    return {
      key,
      code: `Key${upper}`,
      windowsVirtualKeyCode: upper.charCodeAt(0),
    };
  }
  if (/^[A-Z]$/.test(key)) {
    return {
      key,
      code: `Key${key}`,
      windowsVirtualKeyCode: key.charCodeAt(0),
    };
  }
  const named = {
    Backspace: { code: "Backspace", windowsVirtualKeyCode: 8 },
    Escape: { code: "Escape", windowsVirtualKeyCode: 27 },
    Enter: { code: "Enter", windowsVirtualKeyCode: 13 },
    F5: { code: "F5", windowsVirtualKeyCode: 116 },
    Shift: { code: "ShiftLeft", windowsVirtualKeyCode: 16 },
    ",": { code: "Comma", windowsVirtualKeyCode: 188 },
    ".": { code: "Period", windowsVirtualKeyCode: 190 },
    ф: { code: "KeyA", windowsVirtualKeyCode: 65 },
  };
  if (named[key]) {
    return { key, ...named[key] };
  }
  return { key, code: "Unidentified", windowsVirtualKeyCode: 0 };
}

/** A full press: the same two events a keyboard gives, handled by the real input pipeline. */
export async function press(send, key, modifiers = 0) {
  const d = descriptor(key);
  const text = key.length === 1 ? key : undefined;
  await send("Input.dispatchKeyEvent", {
    type: text ? "keyDown" : "rawKeyDown",
    ...d,
    text,
    unmodifiedText: text,
    modifiers,
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...d, modifiers });
}
