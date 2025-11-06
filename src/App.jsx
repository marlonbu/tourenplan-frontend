// src/App.jsx
import React from "react";
import { Route, Routes } from "react-router-dom";
import Planung from "./pages/Planung";
import Tagestour from "./pages/Tagestour";
import Uebersicht from "./pages/Uebersicht";
import Tourverwaltung from "./pages/Tourverwaltung";
import Login from "./pages/Login";
import DashboardLayout from "./layouts/DashboardLayout";

export default function App() {
  const hasToken = !!localStorage.getItem("token");

  if (!hasToken) {
    // Unverändert: Login ohne Sidebar
    return <Login />;
  }

  // Alle “echten” Seiten laufen im neuen Dashboard-Layout
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/" element={<Planung />} />
        <Route path="/tagestour" element={<Tagestour />} />
        <Route path="/gesamtuebersicht" element={<Uebersicht />} />
        <Route path="/tourverwaltung" element={<Tourverwaltung />} />
        <Route path="/login" element={<Login />} />
        {/* Fallback */}
        <Route path="*" element={<Planung />} />
      </Routes>
    </DashboardLayout>
  );
}
