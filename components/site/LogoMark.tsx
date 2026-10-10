/** The HingeLab mark (a row of hinge slits) used in the menubar and on the site pages. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.64} height={size * 0.64} viewBox="0 0 14 14" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round">
        <path d="M2 2v10M4.7 2v4M4.7 8v4M7.4 2v10M10.1 2v4M10.1 8v4M12.6 2v10" />
      </svg>
    </span>
  );
}
