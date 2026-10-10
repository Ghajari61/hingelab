import Link from "next/link";
import { PRODUCT_NAMES, articleBySlug, fieldGroup, type HelpArticle } from "@/lib/help";
import "./help.css";

/** One article: summary, figures, text, then every option of its sections with units and range. */
export function HelpArticleView({ article, linkBase = "/help/" }: { article: HelpArticle; linkBase?: string }) {
  const groups = (article.fields ?? []).map((g) => ({ title: g.title, entries: fieldGroup(g) })).filter((g) => g.entries.length);
  const related = (article.related ?? []).map(articleBySlug).filter((a): a is HelpArticle => !!a);
  return (
    <article className="help-article" data-slug={article.slug}>
      <p className="help-crumb">{PRODUCT_NAMES[article.product]}</p>
      <h1>{article.title}</h1>
      <p className="help-summary">{article.summary}</p>
      {article.images?.length ? (
        <div className={`help-figs n${Math.min(article.images.length, 3)}`}>
          {article.images.map((img) => (
            <figure key={img.src}>
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG figures and screenshots */}
              <img src={img.src} alt={img.alt} loading="lazy" />
              {img.caption && <figcaption>{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      ) : null}
      {article.blocks.map((b, i) => (
        <section key={i} className="help-block">
          {b.h && <h2>{b.h}</h2>}
          {b.p && <p>{b.p}</p>}
          {b.list && <ul>{b.list.map((t, k) => <li key={k}>{t}</li>)}</ul>}
        </section>
      ))}
      {groups.length > 0 && (
        <section className="help-fields" aria-label="Options">
          <h2>Options</h2>
          {groups.map((g, i) => (
            <div key={i}>
              {g.title && <h3>{g.title}</h3>}
              <dl>
                {g.entries.map((f) => (
                  <div key={f.id} className="help-field" data-field={f.id}>
                    <dt><strong>{f.label}</strong><span>{f.range}{f.range !== "any" && f.step ? ` · step ${f.step}` : ""}</span></dt>
                    <dd>{f.help}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </section>
      )}
      {related.length > 0 && (
        <nav className="help-related" aria-label="Related">
          <h2>Related</h2>
          <ul>{related.map((a) => <li key={a.slug}><Link href={`${linkBase}${a.slug}`}>{a.title}</Link></li>)}</ul>
        </nav>
      )}
    </article>
  );
}
