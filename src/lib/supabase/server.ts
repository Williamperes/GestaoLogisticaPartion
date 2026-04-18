import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseServerEnv } from "@/lib/env";

export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components and Route Handlers can run in contexts where cookie mutation isn't allowed.
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  const { url, secretKey } = getSupabaseServerEnv();

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
