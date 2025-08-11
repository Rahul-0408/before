import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { handleErrorResponse } from '@/lib/models/api-error';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { createDataStreamResponse } from 'ai';
import { processChatMessages } from '@/lib/ai/message-utils';
import { postRequestBodySchema, type PostRequestBody } from '../chat/schema';
import { ChatSDKError } from '@/lib/errors';
import { handleInitialChatAndUserMessage } from '@/lib/ai/actions';
import { handleResearchKickoff } from '@/lib/ai/tools/research-kickoff';
import { validateChatAccess } from '@/lib/ai/actions/chat-validation';
// import { geolocation } from '@vercel/functions';

export const maxDuration = 300;

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { messages, model, modelParams, chatMetadata } = requestBody;

    const { profile } = await getAIProfile();
    const config = await getProviderConfig(profile.user_id);

    if (!config.isRateLimitAllowed) {
      return new Response(
        JSON.stringify({
          error: {
            type: 'ratelimit_hit',
            message: config.rateLimitInfo.message,
            isPremiumUser: config.isPremiumUser,
          },
        }),
        { status: 429 },
      );
    }

    const chat = await validateChatAccess({
      chatMetadata,
      userId: profile.user_id,
    });

    const { processedMessages, systemPrompt } = await processChatMessages(
      messages,
      'deep-research-model',
      modelParams,
      profile,
      true, // isPremiumSubscription
    );

    // Handle initial chat creation and user message in parallel with other operations
    const initialChatPromise = handleInitialChatAndUserMessage({
      modelParams,
      chatMetadata,
      profile,
      model,
      chat,
      messages,
    });

    // const { city, country } = geolocation(request);

    return createDataStreamResponse({
      execute: async (dataStream) => {
        dataStream.writeData({
          type: 'ratelimit',
          content: config.rateLimitInfo as any,
        });

        await handleResearchKickoff({
          config: {
            chat,
            messages: processedMessages,
            modelParams,
            profile,
            dataStream,
            abortSignal: request.signal,
            chatMetadata,
            model,
            originalMessages: messages,
            systemPrompt,
            initialChatPromise,
            // userCity: city,
            // userCountry: country,
          },
        });
      },
    });
  } catch (error: any) {
    return handleErrorResponse(error);
  }
}

async function getProviderConfig(user_id: string) {
  // First check pentestgpt-pro rate limit
  const rateLimitStatus = await checkRatelimitOnApi(user_id, 'pentestgpt-pro');

  return {
    isRateLimitAllowed: rateLimitStatus.allowed,
    rateLimitInfo: rateLimitStatus.info,
    isPremiumUser: rateLimitStatus.info.isPremiumUser,
  };
}
