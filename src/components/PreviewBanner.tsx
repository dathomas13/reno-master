import { Link } from 'react-router-dom';

/** shown while nobody is signed in: the model and the plans are public, the rest is not */
export function PreviewBanner() {
  return (
    <div className="bg-accent/15 border-b border-accent/30 px-3 py-2 text-xs flex items-center gap-2">
      <span className="flex-1 text-accent">Vorschau ohne Anmeldung: 3D-Modell und Pläne</span>
      <Link to="/" className="btn btn-ghost px-2 py-1 min-h-0 text-accent underline">
        Anmelden
      </Link>
    </div>
  );
}
