import { request as httpRequest, RequestOptions } from "http";
import { request as httpsRequest } from "https";
import { URL } from "url";

interface HttpResponse {
  status: number;
  data: any;
}

const httpFetch = (
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: any
): Promise<HttpResponse> => {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === "https:";

    const options: RequestOptions = {
      method,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        "Content-Type": "application/json",
        ...headers
      },
      timeout: 30000
    };

    const req = (isHttps ? httpsRequest : httpRequest)(options, res => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf-8");
        let data: any;
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = raw;
        }
        resolve({ status: res.statusCode || 0, data });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out: ${method} ${url}`));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
};

export { httpFetch, HttpResponse };