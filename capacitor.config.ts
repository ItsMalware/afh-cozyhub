import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'co.cyberamira.aifocushub',
  appName: 'AI Focus Hub',
  webDir: 'out',
  server: {
    url: 'https://onyx-agent-cozyhub.web.app',
    cleartext: false,
  },
};

export default config;
