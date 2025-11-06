// src/components/Sidebar.jsx
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";

export default function Sidebar() {
  const location = useLocation();
  const isActive = (path) => location.pathname === path;

  const linkCls = (path) =>
    `mx-3 my-1 px-3 py-2 rounded-lg flex items-center gap-2 transition ${
      isActive(path)
        ? "bg-white text-gehlenborg-blue shadow-soft"
        : "text-white/90 hover:bg-white/10"
    }`;

  const logout = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  return (
    <div className="h-screen w-64 flex flex-col justify-between">
      {/* Logo / Titel */}
      <div>
        <div className="px-4 pt-5 pb-4 flex items-center gap-3">
          <span className="text-2xl" role="img" aria-label="truck">
            🚚
          </span>
          <div>
            <div className="font-bold">Tourenplan</div>
            <div className="text-xs text-white/70">Gehlenborg</div>
          </div>
        </div>
        <hr className="border-white/10 mx-3" />

        {/* Navigation */}
        <nav className="mt-3">
          <Link to="/" className={linkCls("/")}>
            Planung
          </Link>
          <Link to="/tagestour" className={linkCls("/tagestour")}>
            Tagestour
          </Link>
          <Link to="/gesamtuebersicht" className={linkCls("/gesamtuebersicht")}>
            Gesamtübersicht
          </Link>
          <Link to="/tourverwaltung" className={linkCls("/tourverwaltung")}>
            Tourverwaltung
          </Link>
        </nav>
      </div>

      {/* Footer / Logout */}
      <div className="px-4 py-4 border-t border-white/10">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 text-sm bg-white/10 hover:bg-white/15 rounded-lg py-2"
        >
          <LogOut size={16} /> Logout
        </button>
      </div>
    </div>
  );
}
