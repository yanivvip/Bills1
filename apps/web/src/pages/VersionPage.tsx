// Hidden page (not linked anywhere): the stamp of the build that is running, for support and for checking a deploy.
export default function VersionPage() {
  return (
    <main dir="ltr" className="grid min-h-screen place-items-center p-6 text-center">
      <div>
        <div className="text-2xl font-semibold">Bills</div>
        <div className="mt-2 text-muted">{__BUILD_TIME__}</div>
        <div className="text-muted">{__BUILD_SHA__}</div>
      </div>
    </main>
  );
}
