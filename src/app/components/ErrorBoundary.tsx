import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../../locales';

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches runtime errors anywhere in the app and offers a friendly reload. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[sidhel-chor] runtime error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <FatalScreen title={t('errorTitle')} body={t('errorBody')} detail={this.state.error.message} />;
  }
}

export function FatalScreen({ title, body, detail }: { title: string; body: string; detail?: string }) {
  return (
    <div className="safe-pad fixed inset-0 grid place-items-center bg-night">
      <div role="alert" className="panel max-w-md p-6 text-center">
        <h1 className="mb-3 text-2xl font-semibold text-gold">{title}</h1>
        <p className="mb-5 leading-relaxed">{body}</p>
        {detail && <p className="mb-5 break-words font-mono text-xs text-moon/70">{detail}</p>}
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('reload')}
        </button>
      </div>
    </div>
  );
}
