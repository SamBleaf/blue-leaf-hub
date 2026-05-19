export default function PortalPageSkeleton() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 flex flex-col gap-4">
      <div className="animate-pulse rounded-2xl bg-gray-200 h-32" />
      <div className="animate-pulse rounded-2xl bg-gray-200 h-48" />
      <div className="animate-pulse rounded-2xl bg-gray-200 h-24" />
    </div>
  );
}
