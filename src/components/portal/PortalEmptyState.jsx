export default function PortalEmptyState({ icon, title, message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && (
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-2xl">
          {icon}
        </div>
      )}
      <p className="text-base font-semibold text-ink mb-1">{title}</p>
      <p className="text-sm text-muted max-w-xs">{message}</p>
    </div>
  );
}
