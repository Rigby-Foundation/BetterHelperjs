export interface HtmlChunkStreamOptions {
  chunkSize?: number;
}

export interface NodeStreamResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(chunk?: string): void;
  once(event: 'drain', listener: () => void): void;
}

export async function* createHtmlChunkStream(html: string, options: HtmlChunkStreamOptions = {}): AsyncGenerator<string> {
  const chunkSize = Math.max(1, options.chunkSize ?? 16_384);

  for (let offset = 0; offset < html.length; offset += chunkSize) {
    yield html.slice(offset, offset + chunkSize);
  }
}

async function waitDrain(response: NodeStreamResponseLike): Promise<void> {
  await new Promise<void>((resolve) => {
    response.once('drain', resolve);
  });
}

export async function streamToNodeResponse(
  response: NodeStreamResponseLike,
  chunks: Iterable<string> | AsyncIterable<string>,
  status = 200
): Promise<void> {
  response.statusCode = status;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Transfer-Encoding', 'chunked');

  for await (const chunk of chunks) {
    const canContinue = response.write(chunk);
    if (!canContinue) {
      await waitDrain(response);
    }
  }

  response.end();
}

