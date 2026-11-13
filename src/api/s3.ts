// Presigned URLs for R2's S3 API (AWS Signature V4, query string auth). ADR 0002: the browser uploads straight to R2.
// Only the `host` header is signed and the payload is UNSIGNED-PAYLOAD, so the browser can PUT any body to the URL.
export type S3 = { accessKeyId: string; secretAccessKey: string; host: string; region: string };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
const hmac = async (key: ArrayBuffer | Uint8Array, s: string) =>
  crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), enc.encode(s));
const uri = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

/** Presigns `method path` (path = "/bucket/key", unencoded). `expires` is in seconds. */
export async function presign(s3: S3, method: string, path: string, opts: { expires: number; query?: Record<string, string>; now?: Date }) {
  const iso = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // 20130524T000000Z
  const day = iso.slice(0, 8), scope = `${day}/${s3.region}/s3/aws4_request`;
  const q: Record<string, string> = {
    ...opts.query,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${s3.accessKeyId}/${scope}`,
    "X-Amz-Date": iso,
    "X-Amz-Expires": String(opts.expires),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(q).sort().map((k) => `${uri(k)}=${uri(q[k])}`).join("&");
  const canonPath = path.split("/").map(uri).join("/");
  const request = [method, canonPath, query, `host:${s3.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", iso, scope, await sha256(request)].join("\n");
  let key: ArrayBuffer = await hmac(enc.encode("AWS4" + s3.secretAccessKey), day);
  for (const part of [s3.region, "s3", "aws4_request"]) key = await hmac(key, part);
  return `https://${s3.host}${canonPath}?${query}&X-Amz-Signature=${hex(await hmac(key, toSign))}`;
}

/** URLs for a multipart upload the Worker already created: one PUT per part, then the POST that completes it. */
export async function multipartUrls(s3: S3, path: string, uploadId: string, parts: number, expires: number, now?: Date) {
  const urls: string[] = [];
  for (let n = 1; n <= parts; n++) urls.push(await presign(s3, "PUT", path, { expires, now, query: { partNumber: String(n), uploadId } }));
  return { parts: urls, complete: await presign(s3, "POST", path, { expires, now, query: { uploadId } }) };
}

/** Starts a multipart upload (server side) and returns its UploadId. */
export async function createMultipart(s3: S3, path: string, type: string) {
  const r = await fetch(await presign(s3, "POST", path, { expires: 60, query: { uploads: "" } }), { method: "POST", headers: { "content-type": type } });
  const id = (await r.text()).match(/<UploadId>([^<]+)<\/UploadId>/)?.[1];
  if (!r.ok || !id) throw new Error(`CreateMultipartUpload failed (${r.status})`);
  return id;
}
