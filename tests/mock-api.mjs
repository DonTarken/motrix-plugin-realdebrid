// Mock implementation of native "motrix:plugin-api" for automated test suites
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let translations = {};
try {
  const raw = fs.readFileSync(path.resolve(__dirname, "../locales/en-US.json"), "utf8");
  translations = JSON.parse(raw);
} catch {}

export const state = {
  registeredCommands: new Map(),
  beforeCreateHook: null,
  logs: [],
  notifications: [],
  httpRequests: [],
  httpMockResponse: { status: 200, body: JSON.stringify([]) },
  configStore: new Map(),
  storageStore: new Map()
};

export function resetMockState() {
  state.logs.length = 0;
  state.notifications.length = 0;
  state.httpRequests.length = 0;
  state.httpMockResponse = { status: 200, body: JSON.stringify([]) };
  state.configStore.clear();
  state.storageStore.clear();
}

export const commands = {
  register: (id, handler) => {
    state.registeredCommands.set(id, handler);
  }
};

export const config = {
  get: async (key) => state.configStore.get(key) ?? (key === "enabled" ? true : undefined),
  set: async (key, val) => { state.configStore.set(key, val); }
};

export const hooks = {
  beforeCreate: (handler) => {
    state.beforeCreateHook = handler;
  }
};

export const http = {
  request: async (opts) => {
    state.httpRequests.push(opts);
    if (typeof state.httpMockResponse === "function") {
      return await state.httpMockResponse(opts);
    }
    return state.httpMockResponse;
  }
};

export const i18n = {
  language: "en-US",
  dir: "ltr",
  t: (key, params) => {
    let res = translations[key] ?? key;
    if (!params) return res;
    for (const [k, v] of Object.entries(params)) {
      res = res.replace(new RegExp(`{{${k}}}`, "g"), String(v));
    }
    return res;
  },
  on: () => () => {}
};

export const lifecycle = {
  onActivate: () => {},
  onDeactivate: () => {}
};

export const log = {
  trace: (msg, meta) => state.logs.push({ level: "trace", msg, meta }),
  debug: (msg, meta) => state.logs.push({ level: "debug", msg, meta }),
  info: (msg, meta) => state.logs.push({ level: "info", msg, meta }),
  warn: (msg, meta) => state.logs.push({ level: "warn", msg, meta }),
  error: (msg, meta) => state.logs.push({ level: "error", msg, meta }),
  fatal: (msg, meta) => state.logs.push({ level: "fatal", msg, meta })
};

export const notify = {
  show: async (opts) => {
    state.notifications.push(opts);
  }
};

export const storage = {
  get: async (key) => state.storageStore.get(key),
  set: async (key, val) => { state.storageStore.set(key, val); }
};
