import type { SVGProps } from "react";

type GlyphProps = SVGProps<SVGSVGElement>;

function glyphClass(className?: string): string {
  return `prototype-glyph ${className || ""}`.trim();
}

export function ProjectGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...props} className={glyphClass(className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 9 8-4 8 4-8 4z" />
      <path d="m4 13 8 4 8-4" />
      <path d="m4 17 8 4 8-4" />
    </svg>
  );
}

export function FolderGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...props} className={glyphClass(className)} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 7.5h6l1.7-2h9.3v13h-17z" />
    </svg>
  );
}

export function PdmGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...props} className={glyphClass(className)} viewBox="0 0 24 24" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7.5" ry="3" />
      <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
      <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
    </svg>
  );
}

export function TableGlyph({ className, ...props }: GlyphProps) {
  return (
    <svg {...props} className={glyphClass(className)} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="1" />
      <path d="M4 10h16M9 5v14" />
    </svg>
  );
}

interface TreeChevronGlyphProps extends GlyphProps {
  expanded: boolean;
}

export function TreeChevronGlyph({ className, expanded, ...props }: TreeChevronGlyphProps) {
  return (
    <svg
      {...props}
      className={glyphClass(`tree-chevron-icon${expanded ? "" : " is-collapsed"} ${className || ""}`)}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m7 10 5 5 5-5" />
    </svg>
  );
}
