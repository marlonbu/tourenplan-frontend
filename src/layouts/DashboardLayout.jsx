// src/layouts/DashboardLayout.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import Sidebar from "../components/Sidebar";

export default function DashboardLayout({ children }) {
  const logout = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  const mobileLinkCls = ({ isActive }) =>
    `px-3 py-2 rounded-lg text-sm whitespace-nowrap transition ${
      isActive
        ? "bg-white text-gehlenborg-blue shadow-soft"
        : "bg-white/10 text-white/90 hover:bg-white/15"
    }`;

  return (
    <div className="min-h-screen bg-gehlenborg-gray text-gray-800">
      <div className="md:flex md:items-start md:gap-0">
        {/* Sidebar (nur ab md sichtbar) */}
        <aside className="hidden md:block md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 bg-gehlenborg-blue text-white">
          <Sidebar />
        </aside>

        {/* Hauptbereich */}
        <div className="flex-1 min-w-0">
          {/* Mobile Header + Tabs */}
          <header className="md:hidden sticky top-0 z-30 bg-gehlenborg-blue text-white">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🚚</span>
                <div className="leading-tight">
                  <div className="font-semibold">Tourenplan</div>
                  <div className="text-[11px] text-white/75">Gehlenborg</div>
                </div>
              </div>
              <button
                onClick={logout}
                className="text-xs bg-white/10 hover:bg-white/15 px-3 py-1 rounded-md"
              >
                Logout
              </button>
            </div>

            {/* Mobile Tabs */}
            <nav className="px-2 pb-3 flex gap-2 overflow-x-auto">
              <NavLink to="/" end className={mobileLinkCls}>
                Planung
              </NavLink>
              <NavLink to="/tagestour" className={mobileLinkCls}>
                Tagestour
              </NavLink>
              <NavLink to="/gesamtuebersicht" className={mobileLinkCls}>
                Gesamtübersicht
              </NavLink>
              <NavLink to="/tourverwaltung" className={mobileLinkCls}>
                Tourverwaltung
              </NavLink>
            </nav>
          </header>

          {/* Seiteninhalt */}
          <main className="max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
