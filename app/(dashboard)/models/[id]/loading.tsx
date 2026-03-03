export default function ModelPassportLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/70 px-3 py-2 shadow-sm">
        <div
          className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          aria-hidden="true"
        />
        <p className="text-sm text-muted-foreground">Opening model passport…</p>
      </div>
    </div>
  );
}

