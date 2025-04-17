export interface ChatStarter {
  title: string;
  description: string;
  chatMessage: string;
}

export interface PluginSummary {
  id: number;
  name: string;
  categories: string[];
  value: PluginID;
  icon?: string;
  invertInDarkMode?: boolean;
  description?: string;
  githubRepoUrl?: string;
  isInstalled: boolean;
  isPremium: boolean;
  createdAt: string;
  starters: ChatStarter[];
}

export interface Plugin {
  id: PluginID;
}

export enum PluginID {
  NONE = 'none',
  ENHANCED_SEARCH = 'enhanced-search',
  PLUGINS_STORE = 'pluginselector',
  // Tools
  WEB_SEARCH = 'websearch',
  BROWSER = 'browser',
  TERMINAL = 'terminal',
  REASONING = 'reasoning',
  REASONING_WEB_SEARCH = 'reasoning-web-search',
  // Pentest tools
  PORT_SCANNER = 'port-scanner',
  WAF_DETECTOR = 'waf-detector',
  WHOIS_LOOKUP = 'whois-lookup',
  SUBDOMAIN_FINDER = 'subdomain-finder',
  CVE_MAP = 'cve-map',

  // Exploit Tools
  SQLI_EXPLOITER = 'sqli-exploiter',

  // Artifacts
  ARTIFACTS = 'artifacts',
}

export const Plugins: Record<PluginID, Plugin> = Object.fromEntries(
  Object.values(PluginID).map((id) => [id, { id }]),
) as Record<PluginID, Plugin>;

export const PluginList = Object.values(Plugins);

type PluginUrls = Record<string, string>;

export const pluginUrls: PluginUrls = {
  PENTESTGPT: 'https://github.com/hackerai-tech/PentestGPT',
  // Pentest tools
  PORT_SCANNER: 'https://nmap.org',
  WAF_DETECTOR: 'https://github.com/EnableSecurity/wafw00f',
  WHOIS_LOOKUP: 'https://www.whois.com/whois/',
  SUBDOMAIN_FINDER: 'https://github.com/projectdiscovery/subfinder',
  CVE_MAP: 'https://github.com/projectdiscovery/cvemap',
  // Exploit Tools
  SQLI_EXPLOITER: 'https://github.com/sqlmapproject/sqlmap',
};

export const PLUGINS_WITHOUT_IMAGE_SUPPORT: PluginID[] = [
  PluginID.WEB_SEARCH,
  PluginID.REASONING,
  PluginID.REASONING_WEB_SEARCH,
];

export const isPluginWithoutImageSupport = (pluginId: PluginID): boolean => {
  return PLUGINS_WITHOUT_IMAGE_SUPPORT.includes(pluginId);
};
