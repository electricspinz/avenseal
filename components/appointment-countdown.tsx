"use client";

import { useEffect, useMemo, useState } from "react";

function getRemaining(target: Date) {
  const total = Math.max(0, target.getTime() - Date.now());
  const days = Math.floor(total / 86_400_000);
  const hours = Math.floor((total % 86_400_000) / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  return { total, days, hours, minutes };
}

export function AppointmentCountdown({ date, time }: { date: string; time: string }) {
  const target = useMemo(() => new Date(`${date}T${time}:00`), [date, time]);
  const [remaining, setRemaining] = useState(() => getRemaining(target));

  useEffect(() => {
    const timer = window.setInterval(() => setRemaining(getRemaining(target)), 60_000);
    return () => window.clearInterval(timer);
  }, [target]);

  if (Number.isNaN(target.getTime())) return null;

  if (remaining.total === 0) {
    return <span>Appointment time has arrived.</span>;
  }

  return (
    <span>
      {remaining.days > 0 ? `${remaining.days}d ` : ""}
      {remaining.hours}h {remaining.minutes}m until your appointment
    </span>
  );
}
