import type { ReactNode } from 'react';

// A titled section card. Keeps the sidebar / workspace visually segmented.
export function StepCard({
  title,
  icon,
  hint,
  children,
  actions,
}: {
  title: string;
  icon?: string;
  hint?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="aa-card">
      <header className="aa-card-head">
        <h3 className="aa-card-title">
          {icon ? <span className="aa-card-icon">{icon}</span> : null}
          {title}
        </h3>
        {actions ? <div className="aa-card-actions">{actions}</div> : null}
      </header>
      {hint ? <p className="aa-card-hint">{hint}</p> : null}
      <div className="aa-card-body">{children}</div>
    </section>
  );
}
