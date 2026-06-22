import { Link } from "react-router-dom";
import { PageTitle, Empty } from "../clientportal/clientPortalUi.jsx";

/** Placeholder for field-app screens not yet built (phase 2). Links to the existing equivalent. */
export default function FieldStub({ title, hint, linkTo, linkLabel }) {
  return (
    <div className="space-y-4">
      <PageTitle>{title}</PageTitle>
      <Empty title="Coming to the field app soon" hint={hint} />
      {linkTo ? (
        <Link to={linkTo} className="block rounded-lg border border-hairline px-3 py-3 text-center text-sm font-medium text-primary hover:bg-page">
          {linkLabel || "Open"}
        </Link>
      ) : null}
    </div>
  );
}
