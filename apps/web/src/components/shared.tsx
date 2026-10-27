import { ReactNode } from 'react';
import { AlertCircle, ArrowRight, LoaderCircle, SearchX } from 'lucide-react';
import { Button } from './ui/button';
export function Loading() {
  return (
    <div className="state" role="status">
      <LoaderCircle className="spin" />
      <span>Loading your workspace…</span>
    </div>
  );
}
export function ErrorState({ error, retry }: { error: Error | null; retry: () => unknown }) {
  return (
    <div className="state error" role="alert">
      <AlertCircle />
      <p>{error?.message ?? 'Could not load the data'}</p>
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
export function Empty({
  title = 'Nothing here yet',
  children,
}: {
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state">
      <SearchX size={32} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function FormError({ error }: { error: Error | null }) {
  return error ? (
    <div role="alert" className="form-error">
      <AlertCircle size={16} />
      {error.message}
    </div>
  ) : null;
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error && <small className="error">{error}</small>}
    </label>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="title-actions">{children}</div>
    </div>
  );
}
export function Badge({ kind = 'neutral', children }: { kind?: string; children: ReactNode }) {
  return <span className={'badge badge-' + kind}>{children}</span>;
}
export function NextButton({
  page,
  setPage,
  count,
}: {
  page: number;
  setPage: (v: number) => void;
  count: number;
}) {
  return (
    <div className="pagination">
      <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>
        Back
      </Button>
      <span>Page {page}</span>
      <Button size="sm" variant="ghost" disabled={count < 50} onClick={() => setPage(page + 1)}>
        Next <ArrowRight size={14} />
      </Button>
    </div>
  );
}
