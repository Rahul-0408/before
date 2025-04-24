import { executeWebSearchTool } from './web-search';
import { executeTerminalAgent } from './terminal-agent';
import { executeBrowserTool } from './browser';
import { z } from 'zod';
import type { AgentMode, LLMID } from '@/types/llms';
import type { ChatMetadata } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const createToolSchemas = ({
  messages,
  profile,
  agentMode,
  confirmTerminalCommand,
  dataStream,
  abortSignal,
  chatMetadata,
  model,
  supabase,
  isPremiumUser,
}: {
  messages: any;
  profile: any;
  agentMode: AgentMode;
  confirmTerminalCommand: boolean;
  dataStream: any;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
  isPremiumUser: boolean;
}) => {
  const allSchemas = {
    browser: {
      description: `Use the browser tool to open a specific URL and extract its content. \
Some examples of when to use the browser tool include:
- When the user explicitly requests to visit, open, browse, or view a specific webpage or URL.
- When the user directly instructs you to access a specific website they've mentioned.
- When performing security testing, vulnerability assessment, or penetration testing of a website.

Do not use browser tool for general information queries that can be answered without visiting a URL.
Do not use browser tool if the user merely mentions a URL without explicitly asking you to open it.
The browser tool can only visit HTTPS websites with valid domain names. \
It cannot access HTTP-only sites, IP addresses (like 192.168.1.1), or non-standard URLs.

The browser tool can extract content in two formats:
- markdown: Use for general content reading and information extraction (default).
- rawHtml: Use for security testing, vulnerability assessment, and penetration testing to analyze HTML \
structure, forms, scripts, and potential security issues. Also use when raw HTML content would be more \
beneficial for the user's needs.
`,
      parameters: z.object({
        open_url: z.string().url().describe('The URL of the webpage to open'),
        format_output: z
          .enum(['markdown', 'rawHtml'])
          .default('markdown')
          .describe('The format of the output content.'),
      }),
      execute: async ({
        open_url,
        format_output,
      }: { open_url: string; format_output: 'markdown' | 'rawHtml' }) => {
        return executeBrowserTool({
          open_url,
          format_output,
          config: {
            profile,
            messages,
            dataStream,
            abortSignal,
            chatMetadata,
            model,
            supabase,
          },
        });
      },
    },
    webSearch: {
      description: `Search the web for latest information. Use this tool only in specific circumstances: \
1) When the user inquires about current events or requires real-time information such as weather conditions or sports scores. \
2) When the user explicitly requests or instructs to google, search the web or similar. \
Do not use this tool to open URLs, links, or videos. \
Do not use this tool if the user is merely asking about the possibility of searching the web.`,
      parameters: z.object({
        search: z.boolean().describe('Set to true to search the web'),
      }),
      execute: async () => {
        return executeWebSearchTool({
          config: {
            messages,
            profile,
            dataStream,
            isLargeModel: true,
            abortSignal,
            chatMetadata,
            model,
            supabase,
          },
        });
      },
    },
    terminal: {
      description: `Run terminal commands. Select this tool IMMEDIATELY when any terminal operations are needed, don't say or plan anything before selecting this tool.

This tool executes terminal commands in a Ubuntu environment with root privileges. Use this tool when:
1. The user requests to run any command or script
2. The user needs to perform network scanning, enumeration, or other security testing
3. The user needs to install, configure, or use security tools
4. The user needs to analyze files, data, or system information
5. Any task requiring command-line operations`,
      parameters: z.object({
        terminal: z
          .boolean()
          .describe(
            'Set to true to use the terminal for executing terminal commands. Select immediately when terminal operations are needed.',
          ),
      }),
      execute: async () => {
        return executeTerminalAgent({
          config: {
            messages,
            profile,
            agentMode,
            confirmTerminalCommand,
            dataStream,
            abortSignal,
            chatMetadata,
            model,
            supabase,
            isPremiumUser,
            autoSelected: true,
          },
        });
      },
    },
  };

  type SchemaKey = keyof typeof allSchemas;

  return {
    allSchemas,
    getSelectedSchemas: (selectedTool: string | string[]) => {
      if (
        selectedTool === 'all' ||
        !selectedTool ||
        selectedTool.length === 0
      ) {
        return allSchemas;
      }
      if (typeof selectedTool === 'string') {
        return selectedTool in allSchemas
          ? {
              [selectedTool as SchemaKey]:
                allSchemas[selectedTool as SchemaKey],
            }
          : {};
      }
      return Object.fromEntries(
        Object.entries(allSchemas).filter(([key]) =>
          selectedTool.includes(key),
        ),
      );
    },
  };
};
