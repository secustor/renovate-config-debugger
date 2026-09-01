import { useState } from "react";
import { GEAR } from "@/data/octicons";

/**
 * Roadmap 066 — the session menu's identity glyph, in the two sizes it is
 * needed: 26px on the header trigger, 32px in the panel's identity label.
 *
 * The fallback is the whole point of the component. The trigger is now the
 * app's account control, so its glyph has to say which of three states the
 * session is in without any text beside it:
 *
 *   - the GitHub avatar  — signed in, profile fetched
 *   - a person           — signed in, profile fetch didn't land (it is
 *                          cosmetic and allowed to fail; see `oauth.ts`)
 *   - a gear             — signed out, or a deployment with no OAuth at all
 *                          (043), where "settings live here" is the honest
 *                          reading and an account glyph would be a lie
 *
 * `onError` matters more here than it did in the 009 toolbar chip: an avatar
 * URL that 404s (a deleted profile image) used to break a small chip mid-page
 * and now would break the header's primary control, so a broken image falls
 * back to the person glyph rather than rendering as one.
 */

/** The two fallback glyphs, keyed by the prop that picks one. Octicons 16px:
 *  `person` (this module's alone), `gear` (shared with the data table). */
const GLYPHS = {
  person:
    "M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  gear: GEAR,
} as const;

interface Props {
  /** The signed-in user's avatar, when there is one to show. */
  url: string | undefined;
  size: number;
  fallback: keyof typeof GLYPHS;
}

export function SessionAvatar({ url, size, fallback }: Props) {
  const [broken, setBroken] = useState(false);

  // Truthiness, not `!== undefined`: an EMPTY avatar URL has to take the
  // fallback too, and it cannot come back through `onError` — `<img src="">`
  // resolves against the document and never fires one.
  if (url && !broken) {
    return (
      <img
        className="session-avatar"
        src={url}
        alt=""
        width={size}
        height={size}
        onError={() => {
          setBroken(true);
        }}
      />
    );
  }

  return (
    <span className="session-avatar session-avatar-glyph" style={{ width: size, height: size }}>
      <svg
        width={Math.round(size * 0.58)}
        height={Math.round(size * 0.58)}
        viewBox="0 0 16 16"
        aria-hidden="true"
      >
        <path d={GLYPHS[fallback]} />
      </svg>
    </span>
  );
}
