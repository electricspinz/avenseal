"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { trackPageView } from "@/lib/analytics";

function PageViews({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();

  useEffect(() => {
    if (enabled) trackPageView(pathname);
  }, [enabled, pathname]);

  return null;
}

export function GoogleAnalytics({ measurementId }: { measurementId?: string }) {
  const [loaded, setLoaded] = useState(false);
  if (!measurementId || !/^G-[A-Z0-9]+$/.test(measurementId)) return null;

  const quotedMeasurementId = JSON.stringify(measurementId);
  return (
    <>
      <Script id="avenseal-ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || []; window.gtag = window.gtag || function(){window.dataLayer.push(arguments);}; window.gtag("js", new Date()); window.gtag("config", ${quotedMeasurementId}, { send_page_view: false });`}
      </Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`} strategy="afterInteractive" onLoad={() => setLoaded(true)} />
      <PageViews enabled={loaded} />
    </>
  );
}
