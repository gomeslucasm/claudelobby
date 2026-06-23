import https from 'https';

// Uses spoo.me (modern, free, no API key). Falls back to the original URL
// on any failure so a status line item is never left without a link.
export function shorten(url: string): Promise<string> {
  return new Promise(resolve => {
    const body = `url=${encodeURIComponent(url)}`;
    const req = https.request(
      'https://spoo.me/',
      {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Mozilla/5.0',
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString());
            const short = json.short_url as string | undefined;
            resolve(short?.startsWith('http') ? short : url);
          } catch {
            resolve(url);
          }
        });
      }
    );
    req.setTimeout(5000, () => { req.destroy(); resolve(url); });
    req.on('error', () => resolve(url));
    req.write(body);
    req.end();
  });
}
