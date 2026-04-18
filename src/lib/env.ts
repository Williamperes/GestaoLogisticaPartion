const requiredPublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
} as const;

const requiredServerEnv = {
  ...requiredPublicEnv,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
} as const;

function getMissingKeys(env: Record<string, string | undefined>) {
  return Object.entries(env)
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function getSupabasePublicEnv() {
  const missingKeys = getMissingKeys(requiredPublicEnv);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Supabase public env vars: ${missingKeys.join(", ")}`);
  }

  return {
    url: requiredPublicEnv.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: requiredPublicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  };
}

export function getSupabaseServerEnv() {
  const missingKeys = getMissingKeys(requiredServerEnv);

  if (missingKeys.length > 0) {
    throw new Error(`Missing Supabase server env vars: ${missingKeys.join(", ")}`);
  }

  return {
    url: requiredServerEnv.NEXT_PUBLIC_SUPABASE_URL!,
    publishableKey: requiredServerEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    secretKey: requiredServerEnv.SUPABASE_SECRET_KEY!,
  };
}
