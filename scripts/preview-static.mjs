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
	'.map': 'application/json',
	'.txt': 'text/plain; charset=utf-8'
};

async function serveFile(res, filePath, status = 200) {
	try {
		const data = await readFile(filePath);
		res.writeHead(status, {
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
	const rel = path.slice(BASE.length);
	// Mirror GitHub Pages' lookup order for a project site:
	//   /vamp/            -> index.html
	//   /vamp/practice    -> practice.html, else practice/index.html
	//   /vamp/practice/   -> practice/index.html
	// then the SPA fallback (GH Pages serves 404.html, which CI copies from 200.html).
	const candidates =
		rel === '' || rel.endsWith('/')
			? [`${rel}index.html`]
			: extname(rel)
				? [rel]
				: [rel, `${rel}.html`, `${rel}/index.html`];
	for (const candidate of candidates) {
		if (await serveFile(res, join(BUILD, candidate))) return;
	}
	// Any navigation (no file extension) falls back to the app shell, exactly as
	// GH Pages does via 404.html — this is what makes deep links work offline and
	// on refresh. Asset requests must still 404 honestly.
	if (!extname(rel)) {
		for (const shell of ['404.html', '200.html']) {
			if (await serveFile(res, join(BUILD, shell), 404)) return;
		}
	}
	res.writeHead(404);
	res.end('Not found');
});

server.listen(PORT, () => console.log(`static preview: http://localhost:${PORT}${BASE}`));
