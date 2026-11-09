import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  // Another value (the page's address) starts again: an error on one page does not follow to the next
  resetKey?: string;
  // A part of the frame (a banner, the menu): on an error it shows nothing, the page goes on
  silent?: boolean;
  // What failed, for the message and the console ("This page", "The menu")
  label?: string;
};

type State = { error: Error | null; resetKey?: string };

// A chunk that is no longer on the server (the web was updated while open): only a reload brings the new one
function isStaleChunk(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return /ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
    .test(text);
}

/**
 * Keeps an error inside a part of the web: what failed shows a message (what went wrong, and a way out) instead of
 * leaving the whole web blank; the rest of the web goes on.
 */
export default class PageErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Navigating away clears it
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label ?? "A page"} failed:`, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.silent) return null;
    const stale = isStaleChunk(error);
    return (
      <div role="alert" data-testid="page-error"
           className="mx-auto mt-6 max-w-2xl rounded-2xl border border-red-200 bg-white p-6 text-gray-800 shadow-sm dark:border-red-900 dark:bg-gray-900 dark:text-gray-100">
        <h2 className="text-lg font-semibold">
          {stale ? "ScipionWeb was updated" : `${this.props.label ?? "This page"} ran into a problem`}
        </h2>
        <p className="mt-2 text-[15px] text-gray-600 dark:text-gray-300">
          {stale
            ? "This page belongs to the version you opened before: reload to get the new one."
            : "The rest of ScipionWeb still works. Try again, or reload the page; if it happens again, send this message to your administrator."}
        </p>
        {!stale && (
          <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-100 p-3 text-[13.5px] text-red-700 dark:bg-gray-800 dark:text-red-300">
            {error.message || String(error)}
          </pre>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {!stale && (
            <button type="button" onClick={this.retry}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-[14px] font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              Try again
            </button>
          )}
          <button type="button" onClick={() => window.location.reload()}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-blue-700">
            Reload the page
          </button>
          <a href="/home"
             className="rounded-lg border border-gray-300 px-3 py-1.5 text-[14px] font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            Go to Home
          </a>
        </div>
      </div>
    );
  }
}
