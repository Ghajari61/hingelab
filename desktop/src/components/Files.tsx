import { FileText, FolderOpen, Star, Trash2 } from "lucide-react";
import type { RecentProject } from "../ipc";
import type { Favorite } from "../local";

const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "");

/** Project files on this computer (the Recent list Windows keeps) and the designs starred in earlier versions. */
export function Files({ files, favorites, onOpenFile, onForget, onOpenFavorite, onRemoveFavorite }: {
  files: RecentProject[]; favorites: Favorite[];
  /** A file from the list, or (null) one picked in the Open dialog. */
  onOpenFile: (path: string | null) => void;
  onForget: (path: string | null) => void;
  onOpenFavorite: (f: Favorite) => void;
  onRemoveFavorite: (f: Favorite) => void;
}) {
  return (
    <div className="page">
      <header className="page-head row-between">
        <div>
          <h1>Project files</h1>
          <p>HingeLab projects (.oclc) you saved or opened on this computer. Double-click one in Explorer or drop it on the window to open it.</p>
        </div>
        <div className="row">
          {files.length > 0 && <button type="button" className="btn" onClick={() => onForget(null)}>Clear list</button>}
          <button type="button" className="btn primary" onClick={() => onOpenFile(null)}><FolderOpen size={14} aria-hidden />Open…</button>
        </div>
      </header>
      {files.length ? (
        <ul className="list">
          {files.map((f) => (
            <li key={f.path}>
              <button type="button" className="list-item" disabled={!f.exists} onClick={() => onOpenFile(f.path)} title={f.path}>
                <span className="li-icon"><FileText size={16} aria-hidden /></span>
                <span className="li-text"><b>{f.name}</b><small>{f.exists ? folderOf(f.path) : "Moved or deleted"}</small></span>
              </button>
              <button type="button" className="icon-btn" title="Remove from the list" aria-label={`Remove ${f.name} from the list`} onClick={() => onForget(f.path)}><Trash2 size={14} aria-hidden /></button>
            </li>
          ))}
        </ul>
      ) : <p className="empty">No project files yet. In the editor, File › Save project keeps a design as a .oclc file.</p>}
      {favorites.length > 0 && (
        <>
          <h2 className="sub-head"><Star size={15} aria-hidden /> Favorites</h2>
          <ul className="list">
            {favorites.map((f) => (
              <li key={f.id}>
                <button type="button" className="list-item" onClick={() => onOpenFavorite(f)}>
                  <span className="li-thumb"><img src={`/presets/${f.product}/${f.preset ?? ""}.svg`} alt="" loading="lazy" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} /></span>
                  <span className="li-text"><b>{f.name}</b><small>{f.note}</small></span>
                  <span className="li-meta">{f.preset ? "Preset" : "Design"}</span>
                </button>
                <button type="button" className="icon-btn" title="Remove from favorites" aria-label={`Remove ${f.name} from favorites`} onClick={() => onRemoveFavorite(f)}><Trash2 size={14} aria-hidden /></button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
