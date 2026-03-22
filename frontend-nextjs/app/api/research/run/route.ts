import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    const body = await req.json();
    const backendUrl = process.env.BACKEND_URL ?? "http://localhost:8001";

    const upstream = await fetch(`${backendUrl}/api/research/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });

    return new Response(upstream.body, {
        status: upstream.status,
        headers: {
            "Content-Type": "application/x-ndjson",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
