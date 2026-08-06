import { useState } from "react";

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

/** Octicons 16px: `person`, `gear`. */
const GLYPHS = {
  person:
    "M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.431-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z",
  gear: "M8 0a8.2 8.2 0 0 1 .701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107c.018.066.079.158.212.224.231.114.454.243.668.386.123.082.233.09.299.071l1.103-.303c.644-.176 1.392.021 1.82.63.27.385.506.792.704 1.218.315.675.111 1.422-.363 1.891l-.815.806c-.048.048-.098.147-.088.294.016.257.016.515 0 .772-.01.147.04.246.088.294l.815.806c.474.469.678 1.216.363 1.891a7.977 7.977 0 0 1-.704 1.218c-.428.609-1.176.806-1.82.63l-1.103-.303c-.066-.019-.176-.011-.299.071a4.909 4.909 0 0 1-.668.386c-.133.066-.194.158-.212.224l-.288 1.107c-.17.645-.716 1.195-1.459 1.259a8.006 8.006 0 0 1-1.402 0c-.743-.064-1.289-.614-1.459-1.259l-.289-1.107c-.017-.066-.078-.158-.211-.224a4.938 4.938 0 0 1-.668-.386c-.123-.082-.233-.09-.299-.071l-1.103.303c-.644.176-1.392-.021-1.82-.63a8.12 8.12 0 0 1-.704-1.218c-.315-.675-.111-1.422.363-1.891l.815-.806c.048-.048.098-.147.088-.294a6.214 6.214 0 0 1 0-.772c.01-.147-.04-.246-.088-.294l-.815-.806C.635 6.045.431 5.298.746 4.623a7.92 7.92 0 0 1 .704-1.218c.428-.609 1.176-.806 1.82-.63l1.103.303c.066.019.176.011.299-.071.214-.143.437-.272.668-.386.133-.066.194-.158.211-.224l.29-1.107C6.01.645 6.556.095 7.299.03 7.53.01 7.764 0 8 0Zm-.571 1.525c-.036.003-.108.036-.137.146l-.289 1.105c-.147.561-.549.967-.998 1.189-.173.086-.34.183-.5.29-.417.278-.97.423-1.529.27l-1.103-.303c-.109-.03-.175.016-.195.045-.22.312-.412.644-.573.99-.014.031-.021.11.059.19l.815.806c.411.406.562.957.53 1.456a4.709 4.709 0 0 0 0 .582c.032.499-.119 1.05-.53 1.456l-.815.806c-.081.08-.073.159-.059.19.162.346.353.677.573.989.02.03.085.076.195.046l1.102-.303c.56-.153 1.113-.008 1.53.27.161.107.328.204.501.29.447.222.85.629.997 1.189l.289 1.105c.029.109.101.143.137.146a6.6 6.6 0 0 0 1.142 0c.036-.003.108-.036.137-.146l.289-1.105c.147-.561.549-.967.998-1.189.173-.086.34-.183.5-.29.417-.278.97-.423 1.529-.27l1.103.303c.109.029.175-.016.195-.045.22-.313.411-.644.573-.99.014-.031.021-.11-.059-.19l-.815-.806c-.411-.406-.562-.957-.53-1.456a4.709 4.709 0 0 0 0-.582c-.032-.499.119-1.05.53-1.456l.815-.806c.081-.08.073-.159.059-.19a6.464 6.464 0 0 0-.573-.989c-.02-.03-.085-.076-.195-.046l-1.102.303c-.56.153-1.113.008-1.53-.27a4.44 4.44 0 0 0-.501-.29c-.447-.222-.85-.629-.997-1.189l-.289-1.105c-.029-.11-.101-.143-.137-.146a6.6 6.6 0 0 0-1.142 0ZM11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9.5 8a1.5 1.5 0 1 0-3.001.001A1.5 1.5 0 0 0 9.5 8Z",
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
