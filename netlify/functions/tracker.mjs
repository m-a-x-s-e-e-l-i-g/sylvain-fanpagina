import { getTrackerData } from "../../server/tracker-core.mjs";

export default async () => {
  try {
    const payload = await getTrackerData();
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=5, s-maxage=10, stale-while-revalidate=30"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      state: "error",
      message: "The public timing services could not be reached.",
      detail: error instanceof Error ? error.message : String(error),
      fetchedAt: new Date().toISOString(),
      nextRefreshSeconds: 60
    }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
};
