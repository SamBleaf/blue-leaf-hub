import { Link } from "react-router-dom";

export default function Signup() {
  return (
    <div className="flex min-h-screen flex-col bg-page px-4 py-10 font-sans">
      <div className="mx-auto flex w-full max-w-md flex-col items-center">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-primary">Blue Leaf Hub</h1>
          <p className="mt-1 text-sm text-muted">Blue Leaf Building · Adelaide</p>
        </div>

        <div className="w-full rounded-card border border-hairline bg-surface px-6 py-10 shadow-md text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-lg font-semibold text-ink mb-2">Invitation only</h2>
          <p className="text-sm text-muted leading-relaxed mb-6">
            Blue Leaf Hub is a private workspace. Access is granted by invitation from an administrator.
          </p>
          <a
            href="mailto:sam@blueleafbuilding.com.au"
            className="inline-block text-sm font-semibold text-primary underline"
          >
            Contact Sam to request access
          </a>
          <div className="mt-6 pt-6 border-t border-hairline">
            <Link to="/login" className="text-sm text-muted hover:text-ink">
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
