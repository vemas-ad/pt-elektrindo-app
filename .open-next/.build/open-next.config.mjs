import { createRequire as topLevelCreateRequire } from 'module';const require = topLevelCreateRequire(import.meta.url);import bannerUrl from 'url';const __dirname = bannerUrl.fileURLToPath(new URL('.', import.meta.url));

// open-next.config.mjs
var open_next_config_default = {
  cloudflare: {}
};
export {
  open_next_config_default as default
};
