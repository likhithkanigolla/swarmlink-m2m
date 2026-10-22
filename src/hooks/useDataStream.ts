import { useEffect, useRef } from "react";
import { useDashboard } from "@/store/dashboard";
import { createAdapter, type DataAdapter } from "@/services/dataService";

export function useDataStream() {
  const adapterRef = useRef<DataAdapter | null>(null);
  const applyMessage = useDashboard((s) => s.applyMessage);
  const setConnection = useDashboard((s) => s.setConnection);
  const speed = useDashboard((s) => s.speed);
  const paused = useDashboard((s) => s.paused);

  useEffect(() => {
    const adapter = createAdapter();
    adapterRef.current = adapter;
    adapter.start(applyMessage, setConnection);

    return () => {
      adapter.stop();
      adapterRef.current = null;
    };
  }, [applyMessage, setConnection]);

  useEffect(() => {
    adapterRef.current?.setSpeed(speed);
  }, [speed]);

  useEffect(() => {
    adapterRef.current?.setPaused(paused);
  }, [paused]);

  const setRoomCount = (n: number) => {
    adapterRef.current?.setRoomCount(n);
  };

  const decide = (incidentId: string, approve: boolean) => {
    adapterRef.current?.decide(incidentId, approve);
  };

  return { adapter: adapterRef.current, setRoomCount, decide };
}
