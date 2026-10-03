import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
export interface ObjectStorage {
  put(key: string, body: Buffer, type: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}
export class LocalStorage implements ObjectStorage {
  constructor(private root = resolve(".data/uploads")) {}
  private path(key: string) {
    if (!/^[a-zA-Z0-9-]+\.(png|jpg|webp)$/.test(key))
      throw Error("Invalid object key");
    return resolve(this.root, key);
  }
  async put(key: string, body: Buffer, _type: string) {
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(key), body, { flag: "wx" });
  }
  get(key: string) {
    return readFile(this.path(key));
  }
}
export class S3Storage implements ObjectStorage {
  private client: S3Client;
  constructor(
    private bucket: string,
    endpoint: string,
    accessKey: string,
    secretKey: string,
  ) {
    this.client = new S3Client({
      region: "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
  }
  async initialize() {
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (e) {
      if (
        !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(
          (e as Error).name,
        )
      )
        throw e;
    }
  }
  async put(key: string, body: Buffer, type: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: type,
      }),
    );
  }
  async get(key: string) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) throw Error("Object not found");
    return Buffer.from(await res.Body.transformToByteArray());
  }
}
export function imageType(body: Buffer) {
  if (
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { type: "image/png", extension: "png" };
  if (body[0] === 255 && body[1] === 216 && body[2] === 255)
    return { type: "image/jpeg", extension: "jpg" };
  if (
    body.subarray(0, 4).toString() === "RIFF" &&
    body.subarray(8, 12).toString() === "WEBP"
  )
    return { type: "image/webp", extension: "webp" };
  throw Error("Only PNG, JPEG, and WebP image uploads are supported");
}
export function objectStorage(): ObjectStorage {
  return process.env.S3_ENDPOINT
    ? new S3Storage(
        process.env.S3_BUCKET || "inboxflow-assets",
        process.env.S3_ENDPOINT,
        process.env.S3_ACCESS_KEY || "",
        process.env.S3_SECRET_KEY || "",
      )
    : new LocalStorage();
}
