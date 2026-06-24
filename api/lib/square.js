const SQUARE_VERSION = "2025-04-16";

import { DOG_NAME_KEY, PET_NAME_INTAKE_KEY } from "./mapBooking.js";

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

  await Promise.all(
    customerIds.map(async (id) => {
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
      } catch (err) {
        console.warn(`Square custom attributes failed for customer ${id}:`, err.message);
        map[id] = [];
      }
    })
  );

  return map;
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
