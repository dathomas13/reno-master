import { Link } from 'react-router-dom';
import { TopBar } from '@/components/TopBar';

const sections = [
  { to: '/fotos', title: 'Fotos', description: 'Baustellenbilder und Tagebuchfotos', path: 'M3 7h4l1.5-2h7L17 7h4v13H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z' },
  { to: '/belege', title: 'Belege', description: 'Rechnungen und Quittungen', path: 'M6 3h12v18l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5zM8.5 8h7M8.5 12h7M8.5 16h4' },
  { to: '/plaene', title: 'Pläne', description: 'Grundrisse und hochgeladene Pläne', path: 'M3 5h18v14H3zM9 5v14M3 12h6M15 5v6M15 11h6' },
] as const;

function FileIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function FilesPage() {
  return (
    <>
      <TopBar title="Dateien" subtitle="Fotos, Belege und Pläne" />
      <div className="grid gap-3 p-3 sm:grid-cols-3">
        {sections.map((section) => (
          <Link key={section.to} to={section.to} className="card p-4 flex items-center gap-4 text-ink">
            <span className="text-accent shrink-0"><FileIcon path={section.path} /></span>
            <span className="min-w-0">
              <span className="block font-medium">{section.title}</span>
              <span className="block text-sm text-muted">{section.description}</span>
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}