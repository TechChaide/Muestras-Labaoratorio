"use client";

import { useEffect, useState } from "react";

export interface EmpleadoInfo {
  CODIGO: string;
  NOMBRE: string;
  CEDULA?: string;
  DEPARTAMENTO?: string;
  [key: string]: unknown;
}

/** Lee la ficha de empleados activos cacheada por dashboard/layout.tsx (getUsersInfo). */
export function useUsersInfo() {
  const [usersInfo, setUsersInfo] = useState<EmpleadoInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = typeof window !== "undefined" ? localStorage.getItem("usersInfo") : null;
      if (stored) {
        setUsersInfo(JSON.parse(stored));
      }
    } catch (err) {
      console.error("Error leyendo usersInfo:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { usersInfo, isLoading };
}
