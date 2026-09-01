export type WorkspaceHelpGuide = Readonly<{
  title: string;
  summary: string;
  steps: readonly string[];
}>;

export function WorkspaceHelp({
  guide,
}: Readonly<{ guide: WorkspaceHelpGuide }>) {
  return (
    <details className="workspace-help">
      <summary aria-label={`Open help for ${guide.title}`}>
        <span aria-hidden="true">?</span>
        Help
      </summary>
      <section
        className="workspace-help__panel"
        aria-label={`${guide.title} operating guide`}
      >
        <div className="workspace-help__heading">
          <p>Page guide</p>
          <h2>How to use {guide.title}</h2>
          <span>{guide.summary}</span>
        </div>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="workspace-help__note">
          Only the actions permitted by your role are shown on this page.
        </p>
      </section>
    </details>
  );
}
