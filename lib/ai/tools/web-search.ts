import { buildSystemPrompt } from '@/lib/ai/prompts';
import { toVercelChatMessages } from '@/lib/ai/message-utils';
import llmConfig from '@/lib/models/llm-config';
import { streamText } from 'ai';
import { perplexity } from '@ai-sdk/perplexity';
import PostHogClient from '@/app/posthog';

interface WebSearchConfig {
  messages: any[];
  profile: any;
  dataStream: any;
  isLargeModel: boolean;
  directToolCall?: boolean;
}

async function getProviderConfig(isLargeModel: boolean, profile: any) {
  const defaultModel = 'sonar';
  const proModel = 'sonar-pro';

  const selectedModel = isLargeModel ? proModel : defaultModel;

  const systemPrompt = buildSystemPrompt(
    llmConfig.systemPrompts.pentestGPTWebSearch,
    profile.profile_context,
  );

  return {
    systemPrompt,
    selectedModel,
  };
}

export async function executeWebSearchTool({
  config,
}: {
  config: WebSearchConfig;
}) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('Perplexity API key is not set for web search');
  }

  const { messages, profile, dataStream, isLargeModel, directToolCall } =
    config;
  const { systemPrompt, selectedModel } = await getProviderConfig(
    isLargeModel,
    profile,
  );

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'web_search_executed',
      properties: {
        model: selectedModel,
      },
    });
  }

  if (!directToolCall) {
    dataStream.writeData({
      type: 'tool-call',
      content: 'websearch',
    });
  }

  try {
    const { fullStream } = streamText({
      model: perplexity(selectedModel),
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        ...toVercelChatMessages(messages),
      ],
      maxTokens: 2048,
    });

    const citations: string[] = [];
    let hasFirstTextDelta = false;

    for await (const delta of fullStream) {
      if (delta.type === 'source') {
        if (delta.source.sourceType === 'url') {
          citations.push(delta.source.url);
        }
      }

      if (delta.type === 'text-delta') {
        if (!hasFirstTextDelta) {
          // Send citations after first text-delta
          dataStream.writeData({ citations });
          hasFirstTextDelta = true;

          if (!directToolCall) {
            dataStream.writeData({
              type: 'tool-call',
              content: 'none',
            });

            dataStream.writeData({
              type: 'text-delta',
              content: '\n\n',
            });
          }
        }

        dataStream.writeData({
          type: 'text-delta',
          content: delta.textDelta,
        });
      }
    }

    return 'Web search completed';
  } catch (error) {
    console.error('[WebSearch] Error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      model: selectedModel,
    });
    throw error;
  }
}
