export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const csrf =
    typeof window !== "undefined"
      ? sessionStorage.getItem("inboxflow-csrf") || ""
      : "";
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
  });
  let body: any;
  try {
    body = await res.json();
  } catch {
    throw Error(`Request failed (${res.status})`);
  }
  if (!res.ok)
    throw Object.assign(
      Error(body.details?.join("; ") || body.error || "Request failed"),
      { status: res.status },
    );
  if (body.csrf && typeof window !== "undefined")
    sessionStorage.setItem("inboxflow-csrf", body.csrf);
  return body;
}
export const post = (
  path: string,
  data: unknown = {},
  headers: Record<string, string> = {},
) => api(path, { method: "POST", body: JSON.stringify(data), headers });
export function download(name: string, content: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export const dollars = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
