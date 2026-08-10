// src/pages/Login.jsx
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Truck,
  WifiOff,
} from "lucide-react";
import { api } from "../api";

function getLoginErrorMessage(error) {
  if (error?.code === "INVALID_CREDENTIALS") {
    return "Benutzername oder Passwort ist nicht korrekt.";
  }

  if (error?.code === "TIMEOUT") {
    return "Der Server hat zu lange nicht geantwortet. Bitte versuchen Sie es erneut.";
  }

  if (error?.code === "NETWORK_ERROR") {
    return "Der Server ist momentan nicht erreichbar. Bitte prüfen Sie die Internetverbindung und versuchen Sie es erneut.";
  }

  if (error?.status >= 500) {
    return "Der Server hat gerade ein Problem. Bitte versuchen Sie es in einem Moment erneut.";
  }

  return error?.message || "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.";
}

export default function Login({ initialMessage = "", onLoginSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mountedRef = useRef(true);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginStage, setLoginStage] = useState("idle");
  const [notice, setNotice] = useState(() =>
    initialMessage ? { type: "info", text: initialMessage } : null
  );
  const [serverStatus, setServerStatus] = useState("checking");

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (initialMessage) {
      setNotice({ type: "info", text: initialMessage });
    }
  }, [initialMessage]);

  async function checkServer(force = false) {
    setServerStatus("checking");

    try {
      await api.prepareServer({ force });
      if (mountedRef.current) setServerStatus("ready");
    } catch (error) {
      console.error("Serverstatus konnte nicht geprüft werden:", error);
      if (mountedRef.current) setServerStatus("unavailable");
    }
  }

  useEffect(() => {
    checkServer();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();

    if (loading) return;

    setNotice(null);
    api.clearSessionMessage();

    if (!username.trim() || !password) {
      setNotice({
        type: "error",
        text: "Bitte Benutzername und Passwort eingeben.",
      });
      return;
    }

    const slowLoginTimer = window.setTimeout(() => {
      if (mountedRef.current) setLoginStage("starting");
    }, 3500);

    try {
      setLoading(true);
      setLoginStage("checking");

      const { token } = await api.login(username.trim(), password);

      if (!token) {
        setNotice({
          type: "error",
          text: "Anmeldung fehlgeschlagen. Bitte versuchen Sie es erneut.",
        });
        return;
      }

      if (onLoginSuccess) {
        onLoginSuccess();
      }

      const currentPath = `${location.pathname}${location.search}${location.hash}`;
      const fallbackPath = currentPath && currentPath !== "/login" ? currentPath : "/";
      const destination = api.consumeReturnPath(fallbackPath);

      navigate(destination, { replace: true });
    } catch (error) {
      console.error("Anmeldung fehlgeschlagen:", error);

      if (error?.code === "NETWORK_ERROR" || error?.code === "TIMEOUT") {
        setServerStatus("unavailable");
      }

      setNotice({
        type: "error",
        text: getLoginErrorMessage(error),
      });
    } finally {
      window.clearTimeout(slowLoginTimer);

      if (mountedRef.current) {
        setLoading(false);
        setLoginStage("idle");
      }
    }
  }

  const noticeClasses =
    notice?.type === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50 px-3 py-8">
      <div className="w-full max-w-[440px] bg-white rounded-2xl shadow-soft p-6 md:p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-12 w-12 shrink-0 rounded-xl bg-gehlenborg-light text-gehlenborg-blue flex items-center justify-center">
            <Truck size={27} aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-[#0058A3]">Anmelden</h1>
            <p className="text-sm text-gray-500">Tourenplan Gehlenborg</p>
          </div>
        </div>

        <div
          className={`mb-4 rounded-lg border px-3 py-2.5 text-sm ${
            serverStatus === "ready"
              ? "border-green-200 bg-green-50 text-green-700"
              : serverStatus === "unavailable"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-blue-200 bg-blue-50 text-blue-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-2">
            {serverStatus === "ready" ? (
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            ) : serverStatus === "unavailable" ? (
              <WifiOff className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            ) : (
              <Loader2 className="mt-0.5 shrink-0 animate-spin" size={18} aria-hidden="true" />
            )}

            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {serverStatus === "ready"
                  ? "Server ist bereit"
                  : serverStatus === "unavailable"
                  ? "Server noch nicht erreichbar"
                  : "Verbindung zum Server wird vorbereitet"}
              </div>

              <div className="mt-0.5 text-xs opacity-80">
                {serverStatus === "ready"
                  ? "Die Anmeldung kann direkt gestartet werden."
                  : serverStatus === "unavailable"
                  ? "Die Anmeldung versucht die Verbindung trotzdem erneut."
                  : "Beim ersten Öffnen kann der Start einige Sekunden dauern."}
              </div>
            </div>

            {serverStatus === "unavailable" ? (
              <button
                type="button"
                onClick={() => checkServer(true)}
                className="shrink-0 inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-50"
                aria-label="Verbindung erneut prüfen"
              >
                <RefreshCw size={14} aria-hidden="true" />
                Prüfen
              </button>
            ) : null}
          </div>
        </div>

        {notice ? (
          <div
            className={`mb-4 rounded-lg border px-3 py-2.5 text-sm ${noticeClasses}`}
            role="alert"
          >
            {notice.text}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-sm text-gray-700 mb-1">
              Benutzername
            </label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              disabled={loading}
              className="w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#0058A3]/30 disabled:bg-gray-100 disabled:text-gray-500"
              placeholder="z. B. Gehlenborg"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm text-gray-700 mb-1">
              Passwort
            </label>
            <div className="flex items-stretch gap-2">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                disabled={loading}
                className="min-w-0 flex-1 border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-[#0058A3]/30 disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="Passwort"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                disabled={loading}
                className="shrink-0 inline-flex w-12 items-center justify-center rounded-lg border bg-gray-50 text-gray-700 hover:bg-gray-100 disabled:opacity-60"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Passwort ausblenden" : "Passwort anzeigen"}
                title={showPassword ? "Passwort ausblenden" : "Passwort anzeigen"}
              >
                {showPassword ? (
                  <EyeOff size={20} aria-hidden="true" />
                ) : (
                  <Eye size={20} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 bg-[#0058A3] text-white rounded-lg py-3 text-base md:text-lg font-medium hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? <Loader2 className="animate-spin" size={20} aria-hidden="true" /> : null}
            {loginStage === "starting"
              ? "Server wird gestartet…"
              : loading
              ? "Anmeldung wird geprüft…"
              : "Anmelden"}
          </button>
        </form>

        <div className="mt-6 text-xs text-gray-500 leading-relaxed">
          Tipp: Diese Seite kann auf dem Smartphone zum Home-Bildschirm hinzugefügt und dann
          ähnlich wie eine App geöffnet werden.
        </div>
      </div>
    </div>
  );
}
