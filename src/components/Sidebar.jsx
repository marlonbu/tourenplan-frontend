// src/components/Sidebar.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import {
  CalendarDays,
  ClipboardList,
  LogOut,
  Navigation,
  Settings,
  Truck,
} from "lucide-react";

export const navigationItems = [
  {
    to: "/",
    end: true,
    label: "Planung",
    mobileLabel: "Planen",
    title: "Tourenplanung",
    description: "Fahrer, Datum und Stopps planen",
    icon: CalendarDays,
  },
  {
    to: "/tagestour",
    label: "Tagestour",
    mobileLabel: "Tagestour",
    title: "Tagestour",
    description: "Die einfache Ansicht für unterwegs",
    icon: Navigation,
  },
  {
    to: "/gesamtuebersicht",
    label: "Gesamtübersicht",
    mobileLabel: "Touren",
    title: "Gesamtübersicht",
    description: "Alle geplanten Touren ansehen",
    icon: ClipboardList,
  },
  {
    to: "/tourverwaltung",
    label: "Tourverwaltung",
    mobileLabel: "Bearbeiten",
    title: "Tourverwaltung",
    description: "Touren und Stopps bearbeiten",
    icon: Settings,
  },
];

export default function Sidebar({ onLogout }) {
  return (
    <div className="app-sidebar flex h-screen flex-col text-white">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-inset ring-white/20">
              <Truck size={24} aria-hidden="true" />
            </div>

            <div className="min-w-0 leading-tight">
              <div className="truncate text-lg font-bold">Tourenplan</div>
              <div className="mt-1 text-xs text-white/70">Gehlenborg</div>
            </div>
          </div>
        </div>

        <div className="mx-4 border-t border-white/10" />

        <div className="px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/60">
          Arbeitsbereiche
        </div>

        <nav className="space-y-1 px-3" aria-label="Hauptnavigation">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors duration-150 ${
                    isActive
                      ? "bg-white text-gehlenborg-dark shadow-soft"
                      : "text-white/90 hover:bg-white/10 hover:text-white"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? "bg-gehlenborg-light text-gehlenborg-blue"
                          : "bg-white/10 text-white group-hover:bg-white/20"
                      }`}
                    >
                      <Icon size={20} aria-hidden="true" />
                    </span>

                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{item.label}</span>
                      <span
                        className={`mt-0.5 block text-[11px] leading-4 ${
                          isActive ? "text-gray-500" : "text-white/60"
                        }`}
                      >
                        {item.description}
                      </span>
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="mx-4 mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-start gap-3">
            <Navigation className="mt-0.5 shrink-0 text-white/80" size={18} aria-hidden="true" />
            <div>
              <div className="text-sm font-semibold">Für Fahrer unterwegs</div>
              <div className="mt-1 text-xs leading-5 text-white/70">
                Die Tagestour ist für die Nutzung auf dem Smartphone vorgesehen.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <LogOut size={17} aria-hidden="true" />
          Abmelden
        </button>
      </div>
    </div>
  );
}
