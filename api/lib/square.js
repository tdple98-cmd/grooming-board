const SQUARE_VERSION = "2025-04-16";
/** Square bulk/batch endpoints accept at most 100 IDs per request. */
const SQUARE_MAX_BATCH = 100;

import { DOG_NAME_KEY, PET_NAME_INTAKE_KEY } from "./mapBooking.js";

function chunkIds(ids, size = SQUARE_MAX_BATCH) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export function squareBaseUrl(environment) {
  return environment === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 4;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function squareRequest(path, { environment, accessToken, method = "GET", body } = {}) {
  const base = squareBaseUrl(environment);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Square-Version": SQUARE_VERSION,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
      // Square rate-limits bulk syncs — honour Retry-After, else back off.
      const retryAfter = Number(res.headers.get("retry-after")) || 0;
      await sleep(Math.max(retryAfter * 1000, 600 * 2 ** attempt));
      continue;
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.errors?.[0]?.detail || data?.errors?.[0]?.code || res.statusText;
      throw new Error(`Square API ${res.status}: ${msg}`);
    }
    return data;
  }
}

/** List all bookings in range (paginated). */
export async function listBookingsInRange({
  environment,
  accessToken,
  startAtMin,
  startAtMax,
  locationId,
  teamMemberId,
}) {
  const bookings = [];
  let cursor;

  do {
    const params = new URLSearchParams();
    if (cursor) params.set("cursor", cursor);
    if (locationId) params.set("location_id", locationId);
    if (teamMemberId) params.set("team_member_id", teamMemberId);
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
  const map = {};
  for (const batch of chunkIds(customerIds)) {
    const data = await squareRequest("/v2/customers/bulk-retrieve", {
      environment,
      accessToken,
      method: "POST",
      body: { customer_ids: batch },
    });
    for (const [id, resp] of Object.entries(data.responses || {})) {
      if (resp?.customer) map[id] = resp.customer;
    }
  }
  return map;
}

export async function batchRetrieveCatalog({ environment, accessToken, objectIds = [] }) {
  if (!objectIds?.length) return {};
  const map = {};
  for (const batch of chunkIds(objectIds)) {
    const data = await squareRequest("/v2/catalog/batch-retrieve", {
      environment,
      accessToken,
      method: "POST",
      // related objects bring the parent ITEM of each variation, so the board
      // can show the real service name ("Full Groom") not just "Under 10kg".
      body: { object_ids: batch, include_related_objects: true },
    });
    for (const obj of data.objects || []) map[obj.id] = obj;
    for (const obj of data.related_objects || []) map[obj.id] = obj;
  }
  return map;
}

export async function listTeamMemberIds({ environment, accessToken }) {
  const ids = [];
  let cursor;
  do {
    const data = await squareRequest("/v2/team-members/search", {
      environment,
      accessToken,
      method: "POST",
      body: {
        query: { filter: { status: "ACTIVE" } },
        limit: 200,
        ...(cursor ? { cursor } : {}),
      },
    });
    for (const tm of data.team_members || []) {
      if (tm.id) ids.push(tm.id);
    }
    cursor = data.cursor;
  } while (cursor);
  return ids;
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

/** Paginated list of all custom attributes on a customer profile. */
export async function listCustomerCustomAttributesPaged({ environment, accessToken, customerId }) {
  const attributes = [];
  let cursor;

  do {
    const params = new URLSearchParams({ limit: "100", with_definitions: "true" });
    if (cursor) params.set("cursor", cursor);
    const data = await squareRequest(`/v2/customers/${customerId}/custom-attributes?${params}`, {
      environment,
      accessToken,
    });
    if (data.custom_attributes?.length) attributes.push(...data.custom_attributes);
    cursor = data.cursor;
  } while (cursor);

  return attributes;
}

/** Resolve qualified Square keys for pet-name fields (cached per process). */
let petAttributeKeysCache = null;
export async function resolvePetAttributeKeys({ environment, accessToken }) {
  if (petAttributeKeysCache) return petAttributeKeysCache;

  const keys = { dogName: DOG_NAME_KEY, intake: PET_NAME_INTAKE_KEY };
  try {
    let cursor;
    do {
      const params = new URLSearchParams({ limit: "100" });
      if (cursor) params.set("cursor", cursor);
      const data = await squareRequest(`/v2/customers/custom-attribute-definitions?${params}`, {
        environment,
        accessToken,
      });
      for (const def of data.custom_attribute_definitions || []) {
        const key = def.key || "";
        const name = (def.name || "").toLowerCase();
        if (key === DOG_NAME_KEY || name.includes("dog name")) keys.dogName = key;
        if (
          key === PET_NAME_INTAKE_KEY ||
          key.includes("cdd3e144-5bdd-41e5-81b2-103b90dd284d") ||
          name.includes("pet's name") ||
          name.includes("pets name")
        ) {
          keys.intake = key;
        }
      }
      cursor = data.cursor;
    } while (cursor);
  } catch {
    // Fall back to known keys from client spec.
  }

  petAttributeKeysCache = keys;
  return keys;
}

async function retrieveCustomerCustomAttribute({ environment, accessToken, customerId, key }) {
  try {
    const data = await squareRequest(
      `/v2/customers/${customerId}/custom-attributes/${encodeURIComponent(key)}?with_definition=true`,
      { environment, accessToken }
    );
    return data.custom_attribute ? [data.custom_attribute] : [];
  } catch {
    return [];
  }
}

/** List custom attributes for each customer (pet name lives here, not on base customer). */
export async function batchListCustomerCustomAttributes({ environment, accessToken, customerIds = [] }) {
  if (!customerIds?.length) return {};

  const petKeys = await resolvePetAttributeKeys({ environment, accessToken });
  const retrieveKeys = [...new Set([petKeys.dogName, petKeys.intake, DOG_NAME_KEY, PET_NAME_INTAKE_KEY])];
  const map = {};
  const concurrency = 8;
  let index = 0;

  async function fetchOne(id) {
    try {
      let attrs = await listCustomerCustomAttributesPaged({ environment, accessToken, customerId: id });

      if (!attrs.length) {
        const retrieved = [];
        for (const key of retrieveKeys) {
          retrieved.push(...(await retrieveCustomerCustomAttribute({ environment, accessToken, customerId: id, key })));
        }
        const seen = new Set();
        attrs = retrieved.filter((a) => {
          if (!a?.key || seen.has(a.key)) return false;
          seen.add(a.key);
          return true;
        });
      }

      map[id] = attrs;
    } catch {
      map[id] = [];
    }
  }

  async function worker() {
    while (index < customerIds.length) {
      const id = customerIds[index++];
      await fetchOne(id);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, customerIds.length) }, () => worker())
  );

  return map;
}

/**
 * COMPLETED orders closed within [startAt, endAt) at a location — the same data Square's own
 * Sales Report is built from, so revenue matches what's on the owner's phone. Paginated.
 */
export async function searchOrdersForDay({ environment, accessToken, locationId, startAt, endAt }) {
  const orders = [];
  let cursor;
  do {
    const body = {
      location_ids: [locationId],
      query: {
        filter: {
          date_time_filter: { closed_at: { start_at: startAt, end_at: endAt } },
          state_filter: { states: ["COMPLETED"] },
        },
        sort: { sort_field: "CLOSED_AT", sort_order: "ASC" },
      },
      limit: 200,
      ...(cursor ? { cursor } : {}),
    };
    const data = await squareRequest("/v2/orders/search", { environment, accessToken, method: "POST", body });
    if (data.orders?.length) orders.push(...data.orders);
    cursor = data.cursor;
  } while (cursor);
  return orders;
}

/**
 * Sum a day's orders into gross/net/discount/return/tax cents.
 * gross = total_money (post-discount, pre-return — matches Square's "Gross Sales").
 * net   = net_amounts.total_money (gross minus returns — matches Square's "Net Sales").
 */
export function summarizeOrdersRevenue(orders) {
  let grossCents = 0;
  let netCents = 0;
  let discountCents = 0;
  let returnCents = 0;
  let taxCents = 0;
  for (const o of orders || []) {
    grossCents += Number(o.total_money?.amount || 0);
    netCents += Number(o.net_amounts?.total_money?.amount ?? o.total_money?.amount ?? 0);
    discountCents += Number(o.total_discount_money?.amount || 0);
    returnCents += Number(o.return_amounts?.total_money?.amount || 0);
    taxCents += Number(o.total_tax_money?.amount || 0);
  }
  return { grossCents, netCents, discountCents, returnCents, taxCents, orderCount: (orders || []).length };
}

/** Write staff-corrected pet name back to Square dog_name custom attribute. */
export async function upsertCustomerCustomAttribute({
  environment,
  accessToken,
  customerId,
  key,
  value,
}) {
  const encodedKey = encodeURIComponent(key);
  return squareRequest(`/v2/customers/${customerId}/custom-attributes/${encodedKey}`, {
    environment,
    accessToken,
    method: "PUT",
    body: {
      custom_attribute: { value },
    },
  });
}
