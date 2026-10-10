export default function HomePage() {
  return (
    <main className="home">
      <div className="logo">
        <span className="logo-mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round"><path d="M2 2v10M4.7 2v4M4.7 8v4M7.4 2v10M10.1 2v4M10.1 8v4M12.6 2v10" /></svg>
        </span>
        HingeLab
      </div>
      <p>Living-hinge boxes, ready to cut. Phase 1 is the editor — accounts and the marketing site come next.</p>
      <a className="btn-export" href="/app/editor/local">Open the editor</a>
    </main>
  );
}
