import * as React from "react";

type BrandLogoProps = React.SVGProps<SVGSVGElement> & {
  /** Single-color mark that inherits `color`; the spark becomes a cut-out. */
  mono?: boolean;
};

const SPARK =
  "M32 13c1 10 5 14 15 15-10 1-14 5-15 15-1-10-5-14-15-15 10-1 14-5 15-15Z";

/** Chat bubble with an AI spark. No wordmark — the mark stands on its own. */
export function BrandLogo({ mono = false, ...props }: BrandLogoProps) {
  const rawId = React.useId();
  const id = `brand-logo-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = mono ? "currentColor" : `url(#${id}-gradient)`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="AI chat"
      {...props}
    >
      <defs>
        {!mono && (
          <linearGradient
            id={`${id}-gradient`}
            gradientUnits="userSpaceOnUse"
            x1="10"
            y1="6"
            x2="54"
            y2="58"
          >
            <stop stopColor="#B784FF" />
            <stop offset="0.5" stopColor="#863BFF" />
            <stop offset="1" stopColor="#5B21B6" />
          </linearGradient>
        )}
        {mono && (
          <mask id={`${id}-mask`}>
            <rect width="64" height="64" fill="#fff" />
            <path d={SPARK} fill="#000" />
          </mask>
        )}
      </defs>
      <g fill={fill} mask={mono ? `url(#${id}-mask)` : undefined}>
        <rect x="6" y="6" width="52" height="44" rx="15" />
        <path d="M19 43 13 58.5 34.5 47Z" />
      </g>
      {!mono && <path d={SPARK} fill="#fff" fillOpacity="0.96" />}
    </svg>
  );
}
