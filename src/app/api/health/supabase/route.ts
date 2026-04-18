import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.getSession();

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          message: "Supabase client configured, but session check failed.",
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Supabase client configured.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "Supabase env is not configured correctly.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
