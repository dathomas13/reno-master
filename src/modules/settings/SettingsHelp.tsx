import { cloneElement, useId, useState, type ReactElement, type ReactNode } from 'react';

function HelpLabel({ label, help, htmlFor }: { label: string; help?: ReactNode; htmlFor?: string }) {
  const [open, setOpen] = useState(false);
  const helpId = useId();
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 mb-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="label mb-0">
          {label}
        </label>
      ) : (
        <h2 className="font-semibold">{label}</h2>
      )}
      {help && (
        <button
          type="button"
          className="w-11 h-11 flex items-center justify-center text-muted hover:text-ink focus-visible:outline focus-visible:outline-2"
          aria-label={`Hilfe: ${label}`}
          title={`Hilfe: ${label}`}
          aria-expanded={open}
          aria-controls={helpId}
          onClick={() => setOpen(!open)}
        >
          <span
            aria-hidden="true"
            className="w-5 h-5 rounded-full border border-current text-sm leading-[18px]"
          >
            ?
          </span>
        </button>
      )}
      {help && (
        <div id={helpId} hidden={!open} className="col-span-2 text-sm text-muted pb-2">
          {help}
        </div>
      )}
    </div>
  );
}

export function SettingsHeading({ title, children }: { title: string; children?: ReactNode }) {
  return <HelpLabel label={title} help={children} />;
}

export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactElement<{ id?: string }>;
}) {
  const generatedId = useId();
  const inputId = children.props.id ?? generatedId;
  return (
    <div className="mb-4">
      <HelpLabel label={label} help={hint} htmlFor={inputId} />
      {cloneElement(children, { id: inputId })}
    </div>
  );
}
