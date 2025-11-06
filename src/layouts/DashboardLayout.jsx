// src/layouts/DashboardLayout.jsx
import React from "react";
import Sidebar from "../components/Sidebar";

export default function DashboardLayout({ children }) {
  return (
    <div className="min-h-screen flex bg-gehlenborg-gray">
      {/* Sidebar (dunkel) */}
      <aside className="hidden md:flex md:w-64 lg:w-72 bg-gehlenborg-dark text-white">
        <Sidebar />
      </aside>

      {/* Mobile-Topbar als Ersatz der Sidebar */}
      <header className="md:hidden sticky top-0 z-30 bg-gehlenborg-dark text-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🚚</span>
            <span className="font-semibold">Tourenplan</span>
          </div>
          <div className="text-sm opacity-80">Gehlenborg</div>
        </div>
      </header>

      {/* Inhalt (hell) */}
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
