import { Background } from "@/components/background";
import { Hero } from "@/components/hero";
import { InfoSection } from "@/components/info-section";
import { SpeedTestApp } from "@/components/speed-test-app";
import { getServers } from "@/lib/servers";

/**
 * The single page. Server Component by default — only the interactive
 * speed-test tree (`SpeedTestApp`) ships to the client.
 */
export default function Home() {
  const servers = getServers();

  return (
    <>
      <Background />
      <SpeedTestApp servers={servers} hero={<Hero />} />
      <InfoSection />
      <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-muted">
        <p>
          PULSETEST · Results depend on your device, browser, network and the selected server. Upload accuracy requires a
          real upload endpoint.
        </p>
      </footer>
    </>
  );
}
