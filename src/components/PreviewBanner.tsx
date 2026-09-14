import { Link, useLocation } from 'react-router-dom';

/** shown while nobody is signed in: the model and the plans are public, the rest is not */
export function PreviewBanner() {
  const onViewer = useLocation().pathname.startsWith('/3d');
  return (
    <div className="bg-accent/15 border-b border-accent/30 px-3 py-2 text-xs flex items-center gap-3">
      <span className="flex-1 text-accent truncate">Vorschau ohne Anmeldung</span>
      <Link to={onViewer ? '/plaene' : '/3d'} className="text-accent underline whitespace-nowrap">
        {onViewer ? 'Grundrisse' : '3D-Modell'}
      </Link>
      <Link to="/" className="text-accent underline whitespace-nowrap">
        Anmelden
      </Link>
    </div>
  );
}
