import { toVercelChatMessages } from '@/lib/ai/message-utils';
import { streamText } from 'ai';
import { ratelimit } from '@/lib/server/ratelimiter';
import { epochTimeToNaturalLanguage } from '@/lib/utils';
import type { Sandbox } from '@e2b/code-interpreter';
import { pauseSandbox } from '@/lib/tools/e2b/sandbox';
import { createAgentTools } from '@/lib/ai/tools/agent';
import { PENTESTGPT_AGENT_SYSTEM_PROMPT } from '@/lib/models/agent-prompts';
import { getSubscriptionInfo } from '@/lib/server/subscription-utils';
import { isFreePlugin } from '@/lib/tools/tool-store/tools-helper';
import { getToolsWithAnswerPrompt } from '@/lib/tools/tool-store/prompts/system-prompt';
import { getTerminalTemplate } from '@/lib/tools/tool-store/tools-helper';
import { myProvider } from '@/lib/ai/providers';
import { SANDBOX_TEMPLATE } from '@/lib/ai/tools/agent/types';
import { executeTerminalCommandWithConfig } from './terminal-command-executor';
import {
  generateTitleFromUserMessage,
  handleChatWithMetadata,
} from '@/lib/ai/actions';
import { ChatMetadata, LLMID, PluginID, AgentMode } from '@/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

interface TerminalToolConfig {
  messages: any[];
  profile: any;
  dataStream: any;
  agentMode: AgentMode;
  confirmTerminalCommand: boolean;
  selectedPlugin?: PluginID;
  abortSignal: AbortSignal;
  // For saving the chat on backend
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
}

export async function executeTerminalAgent({
  config,
}: {
  config: TerminalToolConfig;
}) {
  const {
    profile,
    dataStream,
    agentMode,
    selectedPlugin,
    abortSignal,
    chatMetadata,
    model,
    supabase,
  } = config;
  let messages = config.messages;

  let sandbox: Sandbox | null = null;
  const persistentSandbox = false;
  const userID = profile.user_id;
  let systemPrompt = PENTESTGPT_AGENT_SYSTEM_PROMPT;
  let terminalTemplate = SANDBOX_TEMPLATE;

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
    if (selectedPlugin && selectedPlugin !== PluginID.NONE) {
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

    // Try to execute terminal command if confirmTerminalCommand is true
    if (config.confirmTerminalCommand) {
      const result = await executeTerminalCommandWithConfig({
        userID,
        dataStream,
        isPremiumUser,
        selectedPlugin,
        terminalTemplate,
        setSandbox,
        initialSandbox: sandbox || undefined,
        initialPersistentSandbox: persistentSandbox,
        messages,
      });

      if (typeof result === 'string') return result;
      messages = result.messages;
    }

    let generatedTitle: string | undefined;
    let customFinishReason: string | null = null;

    await Promise.all([
      (async () => {
        const { fullStream, finishReason } = streamText({
          model: myProvider.languageModel('chat-model-agent'),
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
            isPremiumUser,
            agentMode,
          }),
          maxSteps: 5,
          toolChoice: 'required',
          abortSignal,
          onFinish: async ({ finishReason }: { finishReason: string }) => {
            if (supabase) {
              await handleChatWithMetadata({
                supabase,
                chatMetadata,
                profile,
                model,
                title: generatedTitle,
                messages,
                finishReason: customFinishReason
                  ? customFinishReason
                  : finishReason,
              });
              dataStream.writeData({ isChatSavedInBackend: true });
            }
          },
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
              customFinishReason = 'idle';
              shouldStop = true;
            } else if (chunk.toolName === 'message_ask_user') {
              dataStream.writeData({
                type: 'text-delta',
                content: chunk.args?.text,
              });
              dataStream.writeData({ finishReason: 'message_ask_user' });
              customFinishReason = 'message_ask_user';
              shouldStop = true;
            } else if (
              agentMode === 'ask-every-time' &&
              chunk.toolName === 'shell_exec'
            ) {
              const { exec_dir, command } = chunk.args;
              dataStream.writeData({
                type: 'text-delta',
                content: `<terminal-command exec-dir="${exec_dir}">${command}</terminal-command>`,
              });
              dataStream.writeData({
                finishReason: 'terminal_command_ask_user',
              });
              customFinishReason = 'terminal_command_ask_user';
              shouldStop = true;
            }
          }
        }

        // Send finish reason if not already sent
        if (!shouldStop) {
          const originalFinishReason = await finishReason;
          dataStream.writeData({ finishReason: originalFinishReason });
        }
      })(),
      (async () => {
        if (chatMetadata?.newChat) {
          generatedTitle = await generateTitleFromUserMessage({
            messages,
            abortSignal,
          });
          dataStream.writeData({ chatTitle: generatedTitle });
        }
      })(),
    ]);

    return 'Terminal execution completed';
  } catch (error) {
    console.error('[TerminalAgent] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
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
