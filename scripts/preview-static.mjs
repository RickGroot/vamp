// Minimal zero-dependency static server that serves the adapter-static `build/`
// output under the production base path `/vamp/`, mirroring GitHub Pages. Used
// only for local PWA/offline verification of the real build.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const BUILD = join(process.cwd(), 'build');
const PORT = 5181;
const BASE = '/vamp/';

const MIME = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.ogg': 'audio/ogg',
	'.mp3': 'audio/mpeg',
	'.m4a': 'audio/mp4',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.map': 'application/json'
};

async function serveFile(res, filePath) {
	try {
		const data = await readFile(filePath);
		res.writeHead(200, {
			'content-type': MIME[extname(filePath)] || 'application/octet-stream',
			'service-worker-allowed': BASE
		});
		res.end(data);
		return true;
	} catch {
		return false;
	}
}

const server = createServer(async (req, res) => {
	const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
	if (path === '/vamp') {
		res.writeHead(302, { location: BASE });
		res.end();
		return;
	}
	if (!path.startsWith(BASE)) {
		res.writeHead(404);
		res.end('Serve under /vamp/');
		return;
	}
	let rel = path.slice(BASE.length);
	if (rel === '' || rel.endsWith('/')) rel += 'index.html';
	if (await serveFile(res, join(BUILD, rel))) return;
	// SPA fallback for extension-less deep links.
	if (!extname(rel) && (await serveFile(res, join(BUILD, '200.html')))) return;
	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => console.log(`static preview: http://localhost:${PORT}${BASE}`));
