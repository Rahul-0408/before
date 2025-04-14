import { toVercelChatMessages } from '@/lib/ai/message-utils';
import { streamText } from 'ai';
import { ratelimit } from '@/lib/server/ratelimiter';
import { epochTimeToNaturalLanguage } from '@/lib/utils';
import type { Sandbox } from '@e2b/code-interpreter';
import { pauseSandbox } from '@/lib/tools/e2b/sandbox';
import { createAgentTools } from '@/lib/ai/tools/agent';
import { PENTESTGPT_AGENT_SYSTEM_PROMPT } from '@/lib/models/agent-prompts';
import { getSubscriptionInfo } from '@/lib/server/subscription-utils';
import type { PluginID } from '@/types/plugins';
import { isFreePlugin } from '@/lib/tools/tool-store/tools-helper';
import { getToolsWithAnswerPrompt } from '@/lib/tools/tool-store/prompts/system-prompt';
import { getTerminalTemplate } from '@/lib/tools/tool-store/tools-helper';
import { myProvider } from '@/lib/ai/providers';
import { SANDBOX_TEMPLATE } from '@/lib/ai/tools/agent/types';

interface TerminalToolConfig {
  messages: any[];
  profile: any;
  dataStream: any;
  selectedPlugin?: PluginID;
  previousMessage?: string;
  abortSignal?: AbortSignal;
}

export async function executeTerminalAgent({
  config,
}: {
  config: TerminalToolConfig;
}) {
  const { messages, profile, dataStream, selectedPlugin } = config;

  let sandbox: Sandbox | null = null;
  let persistentSandbox = false;
  const userID = profile.user_id;
  let systemPrompt = PENTESTGPT_AGENT_SYSTEM_PROMPT;
  let terminalTemplate = SANDBOX_TEMPLATE;
  const selectedChatModel = 'chat-model-agent';

  try {
    // Check rate limit
    const rateLimitResult = await ratelimit(userID, 'terminal');
    if (!rateLimitResult.allowed) {
      const waitTime = epochTimeToNaturalLanguage(
        rateLimitResult.timeRemaining!,
      );
      dataStream.writeData({
        type: 'error',
        content: `⚠️ You've reached the limit for terminal usage.\n\nTo ensure fair usage for all users, please wait ${waitTime} before trying again.`,
      });
      return 'Rate limit exceeded';
    }

    const subscriptionInfo = await getSubscriptionInfo(userID);
    const isPremiumUser = subscriptionInfo.isPremium;

    // Handle plugin-specific setup
    if (selectedPlugin) {
      if (!isFreePlugin(selectedPlugin) && !isPremiumUser) {
        dataStream.writeData({
          type: 'error',
          content: `Access Denied to ${selectedPlugin}: The plugin you are trying to use is exclusive to Pro and Team members. Please upgrade to access this plugin.`,
        });
        return 'Access Denied to plugin';
      }

      systemPrompt = getToolsWithAnswerPrompt(selectedPlugin);
      terminalTemplate = getTerminalTemplate(selectedPlugin);
    }

    // Functions to update sandbox and persistentSandbox from tools
    const setSandbox = (newSandbox: Sandbox) => {
      sandbox = newSandbox;
    };

    const setPersistentSandbox = (isPersistent: boolean) => {
      // Prevent setting persistent sandbox for non-premium users
      if (!isPremiumUser) {
        persistentSandbox = false;
      } else {
        persistentSandbox = isPersistent;
      }
    };

    const { fullStream, finishReason } = streamText({
      model: myProvider.languageModel(selectedChatModel),
      maxTokens: 2048,
      system: systemPrompt,
      messages: toVercelChatMessages(messages, true),
      tools: createAgentTools({
        dataStream,
        sandbox,
        userID,
        persistentSandbox,
        selectedPlugin,
        terminalTemplate,
        setSandbox,
        setPersistentSandbox,
        isPremiumUser,
      }),
      maxSteps: 10,
      toolChoice: 'required',
      abortSignal: config.abortSignal,
    });

    // Handle stream
    let shouldStop = false;
    for await (const chunk of fullStream) {
      if (chunk.type === 'text-delta') {
        dataStream.writeData({
          type: 'text-delta',
          content: chunk.textDelta,
        });
      } else if (chunk.type === 'tool-call') {
        if (chunk.toolName === 'idle') {
          dataStream.writeData({ finishReason: 'idle' });
          shouldStop = true;
        } else if (chunk.toolName === 'message_ask_user') {
          dataStream.writeData({
            type: 'text-delta',
            content: chunk.args?.text,
          });
          dataStream.writeData({ finishReason: 'message_ask_user' });
          shouldStop = true;
        }
      }
    }

    // Send finish reason if not already sent
    if (!shouldStop) {
      const originalFinishReason = await finishReason;
      dataStream.writeData({ finishReason: originalFinishReason });
    }

    return 'Terminal execution completed';
  } catch (error) {
    console.error('[TerminalAgent] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      model: selectedChatModel,
      plugin: selectedPlugin,
    });
    dataStream.writeData({
      type: 'error',
      content: 'An error occurred during terminal execution. Please try again.',
    });
    throw error;
  } finally {
    // Pause sandbox at the end of the API request
    if (sandbox && persistentSandbox) {
      await pauseSandbox(sandbox);
    }
  }
}
