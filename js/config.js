// Local-only API key storage. Keys never leave the browser except in
// direct requests to their own provider (Alpha Vantage / Anthropic).
//
// By default the app calls the shared backend worker below (no keys needed,
// but rate-limited to protect the owner's free-tier quota). If a visitor
// enters their own keys in Settings, calls go straight to Alpha
// Vantage/Anthropic instead, unlimited by the shared demo's quota.
const Config = (() => {
  // Set this to your deployed Cloudflare Worker URL (see worker/README.md).
  // Leave blank to force everyone to use their own keys.
  const WORKER_BASE_URL = "";

  const AV_KEY = "startupstory_av_key";
  const CLAUDE_KEY = "startupstory_claude_key";

  function safeGet(key) {
    try {
      return localStorage.getItem(key) || "";
    } catch {
      return "";
    }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // localStorage unavailable (private mode, blocked storage) — key just won't persist
    }
  }

  return {
    getAlphaVantageKey: () => safeGet(AV_KEY),
    getClaudeKey: () => safeGet(CLAUDE_KEY),
    setAlphaVantageKey: (v) => safeSet(AV_KEY, v),
    setClaudeKey: (v) => safeSet(CLAUDE_KEY, v),
    hasOwnKeys: () => !!safeGet(AV_KEY) && !!safeGet(CLAUDE_KEY),
    hasWorker: () => !!WORKER_BASE_URL,
    workerUrl: (path) => `${WORKER_BASE_URL}${path}`,
    // True once the app can make a request one way or the other.
    canRun: () => (!!WORKER_BASE_URL) || (!!safeGet(AV_KEY) && !!safeGet(CLAUDE_KEY)),
  };
})();
