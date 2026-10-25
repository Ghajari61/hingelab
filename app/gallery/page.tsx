import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { thumbnailURL } from "@/lib/projects/thumbnail";
import { encodeShare, productName } from "@/lib/share";
import { listGallery } from "./actions";
import { RemoveDesign } from "./RemoveDesign";
import "../landing.css";
import "./gallery.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gallery", robots: { index: false }, alternates: { canonical: "/gallery" } };

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = Math.max(0, Math.min(1000, Number((await searchParams).page) || 0));
  const r = await listGallery(page);
  return (
    <div className="page landing">
      <SiteHeader />
      <main className="gallery-page">
        <h1>Gallery</h1>
        {!r.ok ? (
          <p className="gal-note">{r.error}</p>
        ) : (
          <>
            <p className="gal-note">Designs people made with HingeLab. Open one to look round it, then Remix to make it yours. To add yours, use File › Share link… in the editor.</p>
            {r.items.length === 0 ? <p className="gal-note">Nothing here yet.</p> : (
              <ul className="gal-grid">
                {r.items.map((it) => (
                  <li key={it.id} className="gal-card">
                    { }
                    <img src={thumbnailURL(it.thumbnail)} alt={`Preview of ${it.name}`} width={320} height={240} loading="lazy" />
                    <div className="gal-meta">
                      <b dir="auto">{it.name}</b>
                      <span>{productName(it.product)}</span>
                    </div>
                    <div className="gal-acts">
                      <a className="btn-export" href={`/app/editor/local?p=${it.product}#share=${encodeShare(it.product, it.params)}`}>Open and remix</a>
                      {it.mine && <RemoveDesign id={it.id} name={it.name} />}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <nav className="gal-pages" aria-label="Gallery pages">
              {page > 0 && <Link href={`/gallery?page=${page - 1}`}>Newer</Link>}
              {r.more && <Link href={`/gallery?page=${page + 1}`}>Older</Link>}
            </nav>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
