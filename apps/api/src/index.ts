import { fileURLToPath } from 'node:url';
import { buildApp } from './app.ts';

const port = Number(process.env.PORT ?? 3001);
const dataDir = process.env.STATADVISOR_DATA ?? fileURLToPath(new URL('../.data', import.meta.url));

const defaultWeb = fileURLToPath(new URL('../../web/dist', import.meta.url));
const webDir = process.env.STATADVISOR_WEB ?? defaultWeb;

const app = buildApp({ dataDir, webDir });

// Yalnızca bu bilgisayardan erişilir: dış ağa açılmaz.
app
  .listen({ host: '127.0.0.1', port })
  .then(() => console.log(`StatAdvisor hazır: http://127.0.0.1:${port}  (veri klasörü: ${dataDir})`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.close().then(() => process.exit(0)));
