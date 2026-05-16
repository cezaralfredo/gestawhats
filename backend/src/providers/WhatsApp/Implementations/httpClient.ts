import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { logger } from "../../../utils/logger";

interface HttpClientConfig {
  baseUrl: string;
  apiToken?: string;
  timeout?: number;
}

const createHttpClient = (config: HttpClientConfig): AxiosInstance => {
  const client = axios.create({
    baseURL: config.baseUrl.replace(/\/+$/, ""),
    timeout: config.timeout || 30000,
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (config.apiToken) {
    client.interceptors.request.use(req => {
      if (req.headers) {
        req.headers.apikey = config.apiToken as string;
      }
      return req;
    });
  }

  client.interceptors.response.use(
    response => response,
    error => {
      if (error.response) {
        logger.error({
          info: "HTTP Provider request failed",
          status: error.response.status,
          data: error.response.data,
          url: error.config?.url
        });
      } else if (error.request) {
        logger.error({
          info: "HTTP Provider request timed out or no response",
          url: error.config?.url
        });
      }
      return Promise.reject(error);
    }
  );

  return client;
};

export { createHttpClient, HttpClientConfig };