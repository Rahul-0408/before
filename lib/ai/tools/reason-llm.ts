import { buildSystemPrompt } from "@/lib/ai/prompts"
import { toVercelChatMessages } from "@/lib/ai/message-utils"
import llmConfig from "@/lib/models/llm-config"
import { streamText } from "ai"
import { myProvider } from "@/lib/ai/providers"

interface ReasonLLMConfig {
  messages: any[]
  profile: any
  dataStream: any
  isLargeModel: boolean
}

async function getProviderConfig(profile: any) {
  const systemPrompt = buildSystemPrompt(
    llmConfig.systemPrompts.pentestGPTReasoning,
    profile.profile_context
  )

  return {
    systemPrompt,
    model: myProvider.languageModel("chat-model-reasoning")
  }
}

export async function executeReasonLLMTool({
  config
}: {
  config: ReasonLLMConfig
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OpenRouter API key is not set for reason LLM")
  }

  const { messages, profile, dataStream } = config
  const { systemPrompt, model } = await getProviderConfig(profile)

  try {
    const { fullStream } = streamText({
      model,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...toVercelChatMessages(messages)
      ],
      maxTokens: 4096
    })

    let thinkingStartTime: number | null = null
    let isThinking = false

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        dataStream.writeData({
          type: "text-delta",
          content: delta.textDelta
        })
      }

      if (delta.type === "reasoning") {
        if (!isThinking) {
          isThinking = true
          thinkingStartTime = Date.now()
        }

        dataStream.writeData({
          type: "reasoning",
          content: delta.textDelta
        })
      }
    }

    if (isThinking && thinkingStartTime) {
      isThinking = false
      const thinkingElapsedSecs = Math.round(
        (Date.now() - thinkingStartTime) / 1000
      )
      dataStream.writeData({
        type: "thinking-time",
        elapsed_secs: thinkingElapsedSecs
      })
    }

    return "Reason LLM execution completed"
  } catch (error) {
    console.error("[ReasonLLM] Error:", {
      error: error instanceof Error ? error.message : "Unknown error",
      model
    })
    throw error
  }
}
