import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Box, CheckCircle2, Download, Globe, MonitorDown, MousePointerClick, PenLine, Scissors } from "lucide-react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { desktopRelease } from "@/lib/site/release";
import { startGroups, type Effort } from "@/lib/site/start";
import "../landing.css";
import "./start.css";

export const metadata: Metadata = {
  title: "Start designing",
  description: "Pick what you want to make and start from a ready-made design: online in your browser, nothing to install, or in the Windows app.",
  alternates: { canonical: "/start" },
};

const EFFORT: Record<Effort, string> = { Easy: "easy", "Some assembly": "mid", Advanced: "adv" };

export default function StartPage() {
  const groups = startGroups();
  const release = desktopRelease();
  return (
    <div className="page landing start-page">
      <SiteHeader />
      <main>
        <section className="start-hero">
          <p className="hero-eyebrow"><MousePointerClick size={14} aria-hidden />Step 1 of 3</p>
          <h1>What would you like to make?</h1>
          <p className="start-lead">Pick one and you start from a ready-made design you can change. It opens right here in your browser: nothing to install and no account needed to try.</p>
          <ol className="start-steps" aria-label="How it works">
            <li className="on"><span>1</span>Pick what to make</li>
            <li><span>2</span><PenLine size={14} aria-hidden />Change the text and size</li>
            <li><span>3</span><Scissors size={14} aria-hidden />Check it in 3D and export</li>
          </ol>
        </section>

        <nav className="start-jump" aria-label="Kinds of project">
          {groups.map((g) => <a key={g.id} href={`#${g.id}`}>{g.title}</a>)}
          <a href="#ways" className="start-jump-app"><MonitorDown size={14} aria-hidden />Windows app</a>
        </nav>

        {groups.map((g) => (
          <section key={g.id} id={g.id} className="start-group" aria-labelledby={`${g.id}-h`}>
            <div className="start-group-head">
              <h2 id={`${g.id}-h`}>{g.title}</h2>
              <p>{g.text}</p>
            </div>
            <ul className="start-grid">
              {g.items.map((c) => (
                <li key={c.id}>
                  <Link href={c.start} className="start-card">
                    <span className="start-pic"><img src={c.picture} alt="" width={300} height={200} loading="lazy" /></span>
                    <span className="start-body">
                      <span className="start-name">{c.name}</span>
                      <span className="start-hint">{c.hint}</span>
                      <span className="start-meta">
                        <span className={`start-effort ${EFFORT[c.effort]}`}>{c.effort}</span>
                        <span className="start-go">Start<ArrowRight size={14} aria-hidden /></span>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section id="ways" className="start-ways" aria-labelledby="ways-h">
          <h2 id="ways-h">Two ways to use HingeLab</h2>
          <div className="ways">
            <div className="way">
              <span className="way-ico"><Globe size={22} aria-hidden /></span>
              <h3>Online, in your browser</h3>
              <ul>
                <li><CheckCircle2 size={15} aria-hidden />Nothing to install: pick a design above and start</li>
                <li><CheckCircle2 size={15} aria-hidden />Try every generator and the 3D preview free</li>
                <li><CheckCircle2 size={15} aria-hidden />Your work is kept in this browser; sign in to save it to the cloud</li>
                <li><CheckCircle2 size={15} aria-hidden />Downloading cut files needs Pro</li>
              </ul>
              <a href="#gifts" className="btn-primary btn-lg">Pick a design<ArrowRight size={18} aria-hidden /></a>
            </div>
            <div className="way">
              <span className="way-ico"><Download size={22} aria-hidden /></span>
              <h3>Windows app</h3>
              <ul>
                <li><CheckCircle2 size={15} aria-hidden />The same editors in their own window, working offline</li>
                <li><CheckCircle2 size={15} aria-hidden />Exports go straight to your job folder</li>
                <li><CheckCircle2 size={15} aria-hidden />Project files open with a double-click; it updates itself</li>
                <li><CheckCircle2 size={15} aria-hidden />Sign in with your HingeLab account</li>
              </ul>
              {release ? (
                <>
                  <a href={release.url} className="btn-ghost btn-lg" download><Download size={18} aria-hidden />Download for Windows</a>
                  <p className="way-fine">Version {release.version}{release.size ? ` · ${release.size}` : ""} · Windows 10 and 11 (64-bit)</p>
                </>
              ) : <p className="way-fine">The Windows installer will be available here soon.</p>}
            </div>
          </div>
          <p className="start-blank"><Box size={15} aria-hidden />Know exactly what you want? <Link href="/generators">See every generator</Link> or <Link href="/templates">browse all templates</Link>.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
