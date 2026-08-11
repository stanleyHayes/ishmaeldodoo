export function PublishedIdentity({
  displayName,
  currentTitle,
}: Readonly<{ displayName: string; currentTitle: string }>) {
  return (
    <h1>
      {displayName}
      <small>{currentTitle}</small>
    </h1>
  );
}
