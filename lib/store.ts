"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, exampleDecisions } from "./defaults";
import { detectLocale, getDict, isLocale } from "./i18n";
import type { Decision, Settings } from "./types";

/**
 * Everything lives in this browser's localStorage — nothing is sent anywhere.
 * Export/import in Settings is the way to back up or move devices.
 */
const STORAGE_KEY = "decision-engine:v1";

export interface AppState {
  settings: Settings;
  decisions: Decision[];
}

const EMPTY: AppState = { settings: DEFAULT_SETTINGS, decisions: [] };

let state: AppState | null = null;
const listeners = new Set<() => void>();

/** First visit: start in the browser's language. */
function fresh(): AppState {
  return { ...EMPTY, settings: { ...EMPTY.settings, locale: detectLocale() } };
}

function read(): AppState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    return normalize(JSON.parse(raw));
  } catch {
    return fresh();
  }
}

function normalize(data: unknown): AppState {
  const d = (data ?? {}) as Partial<AppState>;
  const settings = d.settings ?? DEFAULT_SETTINGS;
  return {
    settings: {
      locale: isLocale(settings.locale) ? settings.locale : detectLocale(),
      profile: { ...DEFAULT_SETTINGS.profile, ...settings.profile },
      priorities: Array.isArray(settings.priorities) ? settings.priorities : DEFAULT_SETTINGS.priorities,
    },
    decisions: Array.isArray(d.decisions) ? d.decisions : [],
  };
}

function write(next: AppState) {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked (private mode): keep working in memory.
  }
  listeners.forEach((l) => l());
}

function getSnapshot() {
  if (state === null) state = read();
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      state = read();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAppState() {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/** Strings for the current language. */
export function useT() {
  return getDict(useAppState().settings.locale);
}

const noopSubscribe = () => () => {};

/** False during server render and hydration, true once localStorage has been read. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

export function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function saveDecision(decision: Decision) {
  const s = getSnapshot();
  const updated = { ...decision, updatedAt: new Date().toISOString() };
  const exists = s.decisions.some((d) => d.id === decision.id);
  write({
    ...s,
    decisions: exists
      ? s.decisions.map((d) => (d.id === decision.id ? updated : d))
      : [updated, ...s.decisions],
  });
}

export function deleteDecision(id: string) {
  const s = getSnapshot();
  write({ ...s, decisions: s.decisions.filter((d) => d.id !== id) });
}

export function saveSettings(settings: Settings) {
  write({ ...getSnapshot(), settings });
}

export function loadExamples() {
  const s = getSnapshot();
  const existing = new Set(s.decisions.map((d) => d.id));
  const missingPriorities = DEFAULT_SETTINGS.priorities.filter(
    (p) => !s.settings.priorities.some((q) => q.id === p.id),
  );
  write({
    settings: { ...s.settings, priorities: [...s.settings.priorities, ...missingPriorities] },
    decisions: [
      ...s.decisions,
      ...exampleDecisions(getDict(s.settings.locale)).filter((d) => !existing.has(d.id)),
    ],
  });
}

export function exportJson() {
  return JSON.stringify({ app: "decision-engine", version: 1, ...getSnapshot() }, null, 2);
}

export function importJson(text: string) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.decisions)) {
    throw new Error("That file doesn't look like a Decision Engine export.");
  }
  write(normalize(parsed));
}

export function resetAll() {
  // Keep the language: wiping the journal shouldn't switch the UI back to English.
  write({ ...EMPTY, settings: { ...EMPTY.settings, locale: getSnapshot().settings.locale } });
}

/** Kept apart from the journal so it never ends up in an exported backup. */
const PASSCODE_KEY = "decision-engine:passcode";

export function getPasscode() {
  try {
    return window.localStorage.getItem(PASSCODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPasscode(value: string) {
  try {
    if (value) window.localStorage.setItem(PASSCODE_KEY, value);
    else window.localStorage.removeItem(PASSCODE_KEY);
  } catch {
    // Storage blocked: the passcode just won't be remembered.
  }
}
