const SQUARE_VERSION = "2025-04-16";

export function squareBaseUrl(environment) {
  return environment === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export async function squareRequest(path, { environment, accessToken, method = "GET", body } = {}) {
  const base = squareBaseUrl(environment);
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || res.statusText;
    throw new Error(`Square API ${res.status}: ${msg}`);
  }
  return data;
}

/** List all bookings in range (paginated). */
export async function listBookingsInRange({ environment, accessToken, startAtMin, startAtMax, locationId }) {
  const bookings = [];
  let cursor;

  do {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (locationId) params.set("location_id", locationId);
    if (startAtMin) params.set("start_at_min", startAtMin);
    if (startAtMax) params.set("start_at_max", startAtMax);
    params.set("limit", "100");

    const data = await squareRequest(`/v2/bookings?${params}`, { environment, accessToken });
    if (data.bookings?.length) bookings.push(...data.bookings);
    cursor = data.cursor;
  } while (cursor);

  return bookings;
}

export async function listLocations({ environment, accessToken }) {
  const data = await squareRequest("/v2/locations", { environment, accessToken });
  return data.locations || [];
}

export async function batchRetrieveCustomers({ environment, accessToken, customerIds = [] }) {
  if (!customerIds?.length) return {};
  const data = await squareRequest("/v2/customers/bulk-retrieve", {
    environment,
    accessToken,
    method: "POST",
    body: { customer_ids: customerIds },
  });
  const map = {};
  for (const [id, resp] of Object.entries(data.responses || {})) {
    if (resp?.customer) map[id] = resp.customer;
  }
  return map;
}

export async function batchRetrieveCatalog({ environment, accessToken, objectIds = [] }) {
  if (!objectIds?.length) return {};
  const data = await squareRequest("/v2/catalog/batch-retrieve", {
    environment,
    accessToken,
    method: "POST",
    body: { object_ids: objectIds },
  });
  const map = {};
  for (const obj of data.objects || []) map[obj.id] = obj;
  return map;
}

export async function searchTeamMembers({ environment, accessToken, teamMemberIds = [] }) {
  if (!teamMemberIds?.length) return {};
  const map = {};
  await Promise.all(
    teamMemberIds.map(async (id) => {
      const data = await squareRequest(`/v2/team-members/${id}`, { environment, accessToken });
      if (data.team_member) map[id] = data.team_member;
    })
  );
  return map;
}
