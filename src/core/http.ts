import { isBrowser } from './runtime.js';

export type HttpHeaders = Record<string, string>;
export type HttpRequestData = BodyInit | null | undefined;

export class HttpClient {
  public defaultHeaders: HttpHeaders = {};

  public async req(
    method: string,
    url: string,
    data: HttpRequestData = '',
    headers: HttpHeaders = {},
    fileProgressElement: HTMLProgressElement | false = false
  ): Promise<string> {
    if (fileProgressElement && isBrowser && typeof XMLHttpRequest !== 'undefined') {
      return this.reqWithXhr(method, url, data, headers, fileProgressElement);
    }

    const finalHeaders = { ...this.defaultHeaders, ...headers };
    const init: RequestInit = {
      method,
      headers: finalHeaders,
      body: method.toUpperCase() === 'GET' || method.toUpperCase() === 'HEAD' ? undefined : data ?? undefined,
    };

    const response = await fetch(url, init);
    if (!response.ok) {
      throw new Error(`${response.status} - ${response.statusText}`);
    }

    return response.text();
  }

  private reqWithXhr(
    method: string,
    url: string,
    data: HttpRequestData,
    headers: HttpHeaders,
    fileProgressElement: HTMLProgressElement
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);

      const allHeaders = { ...this.defaultHeaders, ...headers };
      for (const header in allHeaders) {
        xhr.setRequestHeader(header, allHeaders[header]);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          fileProgressElement.setAttribute('value', String(event.loaded / event.total));
        }
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== 4) return;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.response);
        } else {
          reject(new Error(`${xhr.status} - ${xhr.statusText}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send((data ?? '') as XMLHttpRequestBodyInit);
    });
  }
}

export const http = new HttpClient();
