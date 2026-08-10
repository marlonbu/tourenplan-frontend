// src/layouts/DashboardLayout.jsx
import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LogOut, Truck } from "lucide-react";
import Sidebar, { navigationItems } from "../components/Sidebar";
import { api } from "../api";

function getCurrentNavigationItem(pathname) {
  return (
    navigationItems.find((item) => {
      if (item.end) return pathname === item.to;
      return pathname === item.to || pathname.startsWith(`${item.to}/`);
    }) || navigationItems[0]
  );
}

export default function DashboardLayout({ children }) {
  const location = useLocation();
  const currentPage = getCurrentNavigationItem(location.pathname);

  const logout = () => {
    api.logout();
  };

  return (
    <div className="app-shell min-h-screen text-gray-800">
      <a href="#main-content" className="app-skip-link">
        Zum Inhalt springen
      </a>

      <div className="min-h-screen lg:flex lg:items-start">
        <aside className="hidden h-screen w-[248px] shrink-0 lg:sticky lg:top-0 lg:block xl:w-[264px]">
          <Sidebar onLogout={logout} />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="app-mobile-header sticky top-0 z-40 border-b border-white/10 bg-gehlenborg-blue text-white shadow-lg lg:hidden">
            <div className="flex min-h-[58px] items-center justify-between gap-3 px-3 py-2 sm:px-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/20">
                  <Truck size={22} aria-hidden="true" />
                </div>

                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[11px] font-medium uppercase tracking-[0.12em] text-white/70">
                    Tourenplan · Gehlenborg
                  </div>
                  <div className="mt-1 truncate text-base font-semibold">{currentPage.title}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                className="app-header-action inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                title="Abmelden"
                aria-label="Abmelden"
              >
                <LogOut size={18} aria-hidden="true" />
                <span className="hidden sm:inline">Abmelden</span>
              </button>
            </div>

            <nav
              className="grid grid-cols-4 gap-1 border-t border-white/10 px-2 py-1.5"
              aria-label="Mobile Hauptnavigation"
            >
              {navigationItems.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `app-mobile-nav-link relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center transition-colors ${
                        isActive
                          ? "bg-white text-gehlenborg-blue shadow-soft"
                          : "text-white/80 hover:bg-white/10 hover:text-white"
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon size={19} strokeWidth={isActive ? 2.4 : 2} aria-hidden="true" />
                        <span className="w-full truncate text-[10px] font-semibold leading-tight sm:text-xs">
                          {item.mobileLabel}
                        </span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </header>

          <main id="main-content" className="app-main min-w-0">
            <div className="app-content">
              <div className="app-page">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
