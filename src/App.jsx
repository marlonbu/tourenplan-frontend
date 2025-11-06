import React from "react";
import { NavLink, Route, Routes, useNavigate } from "react-router-dom";
import Planung from "./pages/Planung";
import Tagestour from "./pages/Tagestour";
import Uebersicht from "./pages/Uebersicht";
import Tourverwaltung from "./pages/Tourverwaltung";
import Login from "./pages/Login";
import Sidebar from "./components/Sidebar";

/** Mobile Tabs (nur < md sichtbar) */
function MobileTabs() {
  const base =
    "flex-1 text-center px-3 py-2 rounded-md text-sm font-medium";
  return (
    <nav className="md:hidden bg-white shadow mb-4 rounded-lg p-1 flex gap-1">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${base} ${isActive ? "bg-[#0058A3] text-white" : "text-gray-700"}`
        }
      >
        Planung
      </NavLink>
      <NavLink
        to="/tagestour"
        className={({ isActive }) =>
          `${base} ${isActive ? "bg-[#0058A3] text-white" : "text-gray-700"}`
        }
      >
        Tagestour
      </NavLink>
      <NavLink
        to="/gesamtuebersicht"
        className={({ isActive }) =>
          `${base} ${isActive ? "bg-[#0058A3] text-white" : "text-gray-700"}`
        }
      >
        Übersicht
      </NavLink>
      <NavLink
        to="/tourverwaltung"
        className={({ isActive }) =>
          `${base} ${isActive ? "bg-[#0058A3] text-white" : "text-gray-700"}`
        }
      >
        Verwaltung
      </NavLink>
    </nav>
  );
}

function Layout({ children }) {
  const navigate = useNavigate();
  const hasToken = !!localStorage.getItem("token");

  function handleLogout() {
    localStorage.removeItem("token");
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚚</span>
            <div className="text-xl font-semibold text-[#0058A3]">
              Tourenplan<span className="hidden sm:inline text-gray-500"> Gehlenborg</span>
            </div>
          </div>
          <div className="ml-auto" />
          {hasToken && (
            <button
              onClick={handleLogout}
              className="text-sm bg-gray-200 px-3 py-1 rounded hover:bg-gray-300 transition"
            >
              Logout
            </button>
          )}
        </div>
      </header>

      {/* Body: Sidebar (ab md) + Content */}
      <div className="max-w-6xl mx-auto px-4 py-4 md:py-6 flex">
        {/* Sidebar nur Desktop/Tablet */}
        {hasToken && <Sidebar />}

        {/* Content */}
        <main className="flex-1 md:pl-6">
          {/* Mobile Tabs */}
          {hasToken && <MobileTabs />}
          {children}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const hasToken = !!localStorage.getItem("token");

  return (
    <Layout>
      <Routes>
        {!hasToken ? (
          <Route path="*" element={<Login />} />
        ) : (
          <>
            <Route path="/" element={<Planung />} />
            <Route path="/tagestour" element={<Tagestour />} />
            <Route path="/gesamtuebersicht" element={<Uebersicht />} />
            <Route path="/tourverwaltung" element={<Tourverwaltung />} />
            <Route path="/login" element={<Login />} />
          </>
        )}
      </Routes>
    </Layout>
  );
}
