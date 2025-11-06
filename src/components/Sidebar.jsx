import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";

/** Desktop/Tablet Sidebar – auf Mobile ausgeblendet */
export default function Sidebar() {
  const location = useLocation();
  const isActive = (path) =>
    location.pathname === path;

  const item =
    "px-4 py-3 rounded-md transition";

  const logout = () => {
    localStorage.removeItem("token");
    window.location.reload();
  };

  return (
    <aside className="hidden md:flex md:flex-col md:w-56 shrink-0">
      <div className="flex flex-col justify-between bg-[#0B4072] text-white rounded-xl shadow-soft p-3 w-56 min-h-[calc(100vh-6rem)] sticky top-24">
        <div>
          <div className="flex items-center gap-2 p-3 text-lg font-semibold">
            <span role="img" aria-label="truck">🚚</span>
            <span className="text-white font-bold">Tourenplan</span>
          </div>

          <nav className="flex flex-col gap-1 mt-2">
            <Link
              to="/"
              className={`${item} ${isActive("/") ? "bg-white text-[#0058A3]" : "hover:bg-white/10"}`}
            >
              Planung
            </Link>
            <Link
              to="/tagestour"
              className={`${item} ${isActive("/tagestour") ? "bg-white text-[#0058A3]" : "hover:bg-white/10"}`}
            >
              Tagestour
            </Link>
            <Link
              to="/gesamtuebersicht"
              className={`${item} ${isActive("/gesamtuebersicht") ? "bg-white text-[#0058A3]" : "hover:bg-white/10"}`}
            >
              Gesamtübersicht
            </Link>
            <Link
              to="/tourverwaltung"
              className={`${item} ${isActive("/tourverwaltung") ? "bg-white text-[#0058A3]" : "hover:bg-white/10"}`}
            >
              Tourverwaltung
            </Link>
          </nav>
        </div>

        <div className="p-3 border-t border-white/20">
          <p className="text-sm mb-2 opacity-90">
            Gehlenborg<br />
            <span className="text-xs opacity-75">Rolle: Admin</span>
          </p>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm hover:opacity-80"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </div>
    </aside>
  );
}
