// src/api.js
// Zentrale API-Schicht: richtige Backend-URL, JWT-Behandlung,
// verständliche Verbindungsfehler und sichere Wiederholungen für Lesezugriffe.

const isLocal =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const BASE_URL = isLocal
  ? "http://localhost:10000"
  : "https://tourenplan.onrender.com"; // Backend auf Render

const TOKEN_KEY = "token";
const SESSION_MESSAGE_KEY = "tourenplan:session-message";
const RETURN_PATH_KEY = "tourenplan:return-path";

const DEFAULT_TIMEOUT_MS = 35000;
const WRITE_TIMEOUT_MS = 45000;
const LOGIN_TIMEOUT_MS = 90000;
const UPLOAD_TIMEOUT_MS = 90000;
const RETRY_DELAY_MS = 1200;
const TOKEN_EXPIRY_MARGIN_MS = 5000;

export const AUTH_STATE_EVENT = "tourenplan:auth-state-changed";

export class ApiError extends Error {
  constructor(message, { status = 0, code = "API_ERROR", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function getStoredToken() {
  if (!canUseBrowserStorage()) return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function setSessionMessage(message) {
  if (!canUseBrowserStorage()) return;

  if (message) {
    window.sessionStorage.setItem(SESSION_MESSAGE_KEY, message);
  } else {
    window.sessionStorage.removeItem(SESSION_MESSAGE_KEY);
  }
}

function getSessionMessage() {
  if (!canUseBrowserStorage()) return "";
  return window.sessionStorage.getItem(SESSION_MESSAGE_KEY) || "";
}

function currentAppPath() {
  if (!canUseBrowserStorage()) return "/";

  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return path && path !== "/login" ? path : "/";
}

function rememberCurrentPath() {
  if (!canUseBrowserStorage()) return;

  const path = currentAppPath();
  if (path !== "/login") {
    window.sessionStorage.setItem(RETURN_PATH_KEY, path);
  }
}

function emitAuthState(detail = {}) {
  if (!canUseBrowserStorage()) return;

  window.dispatchEvent(
    new CustomEvent(AUTH_STATE_EVENT, {
      detail,
    })
  );
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = window.atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getTokenExpiration(token) {
  const payload = decodeJwtPayload(token);
  const expirationSeconds = Number(payload?.exp);

  if (!Number.isFinite(expirationSeconds)) return null;
  return expirationSeconds * 1000;
}

function clearStoredSession({ message = "", rememberPath = false, notify = true } = {}) {
  if (!canUseBrowserStorage()) return;

  if (rememberPath) rememberCurrentPath();

  window.localStorage.removeItem(TOKEN_KEY);
  setSessionMessage(message);

  if (notify) {
    emitAuthState({ authenticated: false, message });
  }
}

function expireSession(
  message = "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an."
) {
  clearStoredSession({
    message,
    rememberPath: true,
    notify: true,
  });
}

function getSessionStatus() {
  const token = getStoredToken();
  const storedMessage = getSessionMessage();

  if (!token) {
    return {
      authenticated: false,
      expiresAt: null,
      message: storedMessage,
    };
  }

  const expiresAt = getTokenExpiration(token);

  if (expiresAt && expiresAt <= Date.now() + TOKEN_EXPIRY_MARGIN_MS) {
    const message = "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.";

    clearStoredSession({
      message,
      rememberPath: true,
      notify: false,
    });

    return {
      authenticated: false,
      expiresAt: null,
      message,
    };
  }

  return {
    authenticated: true,
    expiresAt,
    message: "",
  };
}

function storeToken(token) {
  if (!canUseBrowserStorage() || !token) return;

  window.localStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.removeItem(SESSION_MESSAGE_KEY);
  emitAuthState({ authenticated: true, message: "" });
}

function consumeReturnPath(fallback = "/") {
  if (!canUseBrowserStorage()) return fallback;

  const savedPath = window.sessionStorage.getItem(RETURN_PATH_KEY);
  window.sessionStorage.removeItem(RETURN_PATH_KEY);

  if (
    savedPath &&
    savedPath.startsWith("/") &&
    !savedPath.startsWith("//") &&
    savedPath !== "/login"
  ) {
    return savedPath;
  }

  return fallback;
}

function authHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("Der Server hat zu lange nicht geantwortet.", {
        code: "TIMEOUT",
      });
    }

    throw new ApiError("Der Server ist momentan nicht erreichbar.", {
      code: "NETWORK_ERROR",
      details: error,
    });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function parseJsonSafe(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!text) return null;

  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError("Die Server-Antwort konnte nicht gelesen werden.", {
        status: response.status,
        code: "INVALID_RESPONSE",
      });
    }
  }

  if (text.trim().startsWith("<")) {
    throw new ApiError(
      "Server-Antwort war HTML (vermutlich falsche URL oder Weiterleitung).",
      {
        status: response.status,
        code: "INVALID_RESPONSE",
      }
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readErrorMessage(response, fallbackMessage) {
  try {
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    if (!text || text.trim().startsWith("<")) return fallbackMessage;

    if (contentType.includes("application/json")) {
      const data = JSON.parse(text);
      return data?.error || data?.message || fallbackMessage;
    }

    return text;
  } catch {
    return fallbackMessage;
  }
}

function isRetryableStatus(status) {
  return status === 408 || status === 502 || status === 503 || status === 504;
}

function isRetryableError(error) {
  return error?.code === "TIMEOUT" || error?.code === "NETWORK_ERROR";
}

async function request(
  path,
  {
    method = "GET",
    headers = {},
    body,
    requiresAuth = true,
    timeoutMs,
    retry,
    errorMessage = "Anfrage fehlgeschlagen",
  } = {}
) {
  const normalizedMethod = method.toUpperCase();
  const shouldRetry = retry ?? normalizedMethod === "GET";
  const maximumAttempts = shouldRetry ? 2 : 1;
  const requestTimeout =
    timeoutMs ?? (normalizedMethod === "GET" ? DEFAULT_TIMEOUT_MS : WRITE_TIMEOUT_MS);

  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    let response;

    try {
      response = await fetchWithTimeout(
        `${BASE_URL}${path}`,
        {
          method: normalizedMethod,
          headers: {
            ...headers,
            ...(requiresAuth ? authHeaders() : {}),
          },
          body,
        },
        requestTimeout
      );
    } catch (error) {
      if (attempt < maximumAttempts && isRetryableError(error)) {
        await wait(RETRY_DELAY_MS);
        continue;
      }

      throw error;
    }

    if (requiresAuth && response.status === 401) {
      const message = "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.";
      expireSession(message);

      throw new ApiError(message, {
        status: 401,
        code: "SESSION_EXPIRED",
      });
    }

    if (!response.ok) {
      if (attempt < maximumAttempts && isRetryableStatus(response.status)) {
        await wait(RETRY_DELAY_MS);
        continue;
      }

      const message = await readErrorMessage(response, errorMessage);
      throw new ApiError(message, {
        status: response.status,
        code: `HTTP_${response.status}`,
      });
    }

    return parseJsonSafe(response);
  }

  throw new ApiError(errorMessage);
}

let healthRequest = null;
let lastSuccessfulHealthCheck = 0;

async function prepareServer({ force = false } = {}) {
  const healthCheckIsFresh = Date.now() - lastSuccessfulHealthCheck < 120000;

  if (!force && healthCheckIsFresh) {
    return { ok: true, cached: true };
  }

  if (healthRequest) return healthRequest;

  healthRequest = request("/health", {
    requiresAuth: false,
    timeoutMs: 65000,
    retry: false,
    errorMessage: "Serverstatus konnte nicht geprüft werden",
  })
    .then((data) => {
      lastSuccessfulHealthCheck = Date.now();
      return data;
    })
    .finally(() => {
      healthRequest = null;
    });

  return healthRequest;
}

export const api = {
  // ---- Sitzung und Serverstatus ----
  getSessionStatus,
  getSessionMessage,
  clearSessionMessage() {
    setSessionMessage("");
  },
  expireSession,
  logout() {
    clearStoredSession({ message: "", rememberPath: false, notify: true });
  },
  consumeReturnPath,
  prepareServer,

  // ---- Login ----
  async login(username, password) {
    try {
      const data = await request("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        requiresAuth: false,
        timeoutMs: LOGIN_TIMEOUT_MS,
        retry: false,
        errorMessage: "Anmeldung fehlgeschlagen",
      });

      if (!data?.token) {
        throw new ApiError("Der Server hat keinen Anmeldeschlüssel zurückgegeben.", {
          code: "INVALID_LOGIN_RESPONSE",
        });
      }

      storeToken(data.token);
      return data;
    } catch (error) {
      if (error?.status === 401) {
        throw new ApiError("Benutzername oder Passwort ist nicht korrekt.", {
          status: 401,
          code: "INVALID_CREDENTIALS",
        });
      }

      throw error;
    }
  },

  // ---- Fahrer ----
  async listFahrer() {
    return request("/fahrer", {
      errorMessage: "Fahrer laden fehlgeschlagen",
    });
  },
  async addFahrer(name) {
    return request("/fahrer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      errorMessage: "Fahrer konnte nicht hinzugefügt werden",
    });
  },
  async deleteFahrer(id) {
    return request(`/fahrer/${id}`, {
      method: "DELETE",
      errorMessage: "Fahrer konnte nicht gelöscht werden",
    });
  },

  // ---- Touren ----
  async createTour(fahrer_id, datum) {
    return request("/touren", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fahrer_id, datum }),
      errorMessage: "Tour konnte nicht angelegt werden",
    });
  },
  async getTour(fahrer_id, datum) {
    return request(`/touren/${fahrer_id}/${datum}`, {
      errorMessage: "Tour konnte nicht geladen werden",
    });
  },
  async getTourenAdmin(payload) {
    const params = new URLSearchParams();
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.set(key, value);
      }
    });

    const query = params.toString();
    return request(`/touren-admin${query ? `?${query}` : ""}`, {
      errorMessage: "Touren (Admin) konnten nicht geladen werden",
    });
  },
  async updateTour(id, body) {
    return request(`/touren/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      errorMessage: "Tour konnte nicht gespeichert werden",
    });
  },
  async deleteTour(id) {
    return request(`/touren/${id}`, {
      method: "DELETE",
      errorMessage: "Tour konnte nicht gelöscht werden",
    });
  },

  // ---- Reihenfolge speichern ----
  async reorderTouren(ids) {
    return request("/touren-admin/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids || [] }),
      errorMessage: "Reihenfolge konnte nicht gespeichert werden",
    });
  },

  // ---- Stopps ----
  async getStoppsByTour(tourId) {
    return request(`/touren/${tourId}/stopps`, {
      errorMessage: "Stopps konnten nicht geladen werden",
    });
  },
  async createStopp(tour_id, body) {
    return request(`/stopps/${tour_id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      errorMessage: "Stopp konnte nicht angelegt werden",
    });
  },
  async updateStopp(id, body) {
    return request(`/stopps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
      errorMessage: "Stopp konnte nicht gespeichert werden",
    });
  },
  async deleteStopp(id) {
    return request(`/stopps/${id}`, {
      method: "DELETE",
      errorMessage: "Stopp konnte nicht gelöscht werden",
    });
  },
  async updateStoppAnmerkung(id, anmerkung_fahrer) {
    return request(`/stopps/${id}/anmerkung`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anmerkung_fahrer }),
      errorMessage: "Anmerkung konnte nicht gespeichert werden",
    });
  },

  // ---- Fotos (Mehrfach, bis 3) ----
  async getStoppFotos(stoppId) {
    return request(`/stopps/${stoppId}/fotos`, {
      errorMessage: "Fotos konnten nicht geladen werden",
    });
  },
  async uploadStoppFoto(stoppId, file) {
    const formData = new FormData();
    formData.append("foto", file); // Feldname MUSS "foto" heißen

    return request(`/stopps/${stoppId}/fotos`, {
      method: "POST",
      body: formData,
      timeoutMs: UPLOAD_TIMEOUT_MS,
      errorMessage: "Foto-Upload fehlgeschlagen",
    });
  },
  async deleteStoppFoto(fotoId) {
    return request(`/stopps/fotos/${fotoId}`, {
      method: "DELETE",
      errorMessage: "Foto konnte nicht gelöscht werden",
    });
  },
};
