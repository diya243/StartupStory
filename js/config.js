// Local-only API key storage. Keys never leave the browser except in
// direct requests to their own provider (Alpha Vantage / Anthropic).
const Config = (() => {
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
    hasKeys: () => !!safeGet(AV_KEY) && !!safeGet(CLAUDE_KEY),
  };
})();
