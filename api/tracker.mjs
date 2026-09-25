import { getTrackerData } from "../server/tracker-core.mjs";

export default async function handler(_request, response) {
  try {
    const payload = await getTrackerData();
    response.setHeader("Cache-Control", "public, max-age=5, s-maxage=10, stale-while-revalidate=30");
    response.status(200).json(payload);
  } catch (error) {
    response.status(502).json({
      ok: false,
      state: "error",
      message: "The public timing services could not be reached.",
      detail: error instanceof Error ? error.message : String(error),
      fetchedAt: new Date().toISOString(),
      nextRefreshSeconds: 60
    });
  }
}
