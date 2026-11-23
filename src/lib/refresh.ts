"use client";
import { useEffect, useRef } from "react";

const EVT = "ledger:refresh";

/** Avisa a todas las vistas abiertas que deben recargar sus datos. */
export const refresh = () => window.dispatchEvent(new Event(EVT));

/** Como useLoad, pero solo escucha `refresh()` (no se ejecuta al montar). */
export function useOnRefresh(cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const run = () => ref.current();
    window.addEventListener(EVT, run);
    return () => window.removeEventListener(EVT, run);
  }, []);
}

/** Ejecuta `load` al montar y cada vez que se dispara `refresh()`. */
export function useLoad(load: () => void | Promise<void>) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    const run = () => void ref.current();
    run();
    window.addEventListener(EVT, run);
    return () => window.removeEventListener(EVT, run);
  }, []);
}
