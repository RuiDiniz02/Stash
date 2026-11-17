import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div role="status" aria-label="Loading view" className="mx-auto max-w-5xl space-y-4 px-4 py-5 md:px-8">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  );
}
