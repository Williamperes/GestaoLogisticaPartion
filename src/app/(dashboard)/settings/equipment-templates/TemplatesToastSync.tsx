"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function TemplatesToastSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastMessageRef = useRef<string | null>(null);

  useEffect(() => {
    const error = searchParams.get("error");
    const success = searchParams.get("success");
    const message = error ?? success;
    if (!message || message === lastMessageRef.current) return;
    lastMessageRef.current = message;

    if (error) toast.error(error);
    else toast.success(success!);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("error");
    nextParams.delete("success");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  return null;
}
