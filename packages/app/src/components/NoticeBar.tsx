/**
 * Roadmap 040 — the dismissable non-fatal notice (version drift, the result of
 * a load-from-repo). One paragraph and its dismiss button, lifted out of
 * App.tsx by the JSX-depth ratchet.
 */

interface Props {
  message: string;
  onDismiss: () => void;
}

export function NoticeBar({ message, onDismiss }: Props) {
  return (
    <p className="app-notice">
      {message}
      <button type="button" className="app-notice-dismiss" onClick={onDismiss}>
        dismiss
      </button>
    </p>
  );
}
