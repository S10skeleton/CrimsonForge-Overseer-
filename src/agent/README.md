# Wiring Up the Anthropic API

When ready to activate the AI agent, follow these steps:

## 1. Install Dependencies

```bash
npm install @anthropic-ai/sdk
```

## 2. Add Environment Variable

Add to `.env` and Railway environment variables:

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```

## 3. Update src/agent/index.ts

Replace the TODO block in `runAgent()` with:

```typescript
import Anthropic from '@anthropic-ai/sdk'

export async function runAgent(
  userMessage: string,
  recentBriefing?: MorningBriefing
): Promise<string> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  const context = buildContext(recentBriefing)
  const tools = context.availableTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }))

  interface ToolUseBlock {
    type: 'tool_use'
    id: string
    name: string
    input: Record<string, unknown>
  }
  interface TextBlock {
    type: 'text'
    text: string
  }
  type ContentBlock = ToolUseBlock | TextBlock

  const messages: Array<{ role: 'user' | 'assistant'; content: string | ContentBlock[] }> = [
    { role: 'user', content: userMessage },
  ]

  let response = await client.messages.create({
    model: 'claude-opus-4-1',
    max_tokens: 1024,
    system: context.systemPrompt,
    tools,
    messages,
  })

  // Handle tool_use stops in a loop
  while (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    )

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (toolUseBlock) => {
        const tool = context.availableTools.find(t => t.name === toolUseBlock.name)
        if (!tool) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolUseBlock.id,
            content: `Tool ${toolUseBlock.name} not found`,
          }
        }

        const result = await tool.execute(toolUseBlock.input)
        return {
          type: 'tool_result' as const,
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(result),
        }
      })
    )

    // Add assistant response and tool results to messages
    messages.push({
      role: 'assistant',
      content: response.content,
    })

    messages.push({
      role: 'user',
      content: toolResults,
    })

    // Get next response
    response = await client.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 1024,
      system: context.systemPrompt,
      tools,
      messages,
    })
  }

  // Extract final text response
  const textBlocks = response.content.filter(
    (block): block is TextBlock => block.type === 'text'
  )
  return textBlocks.map(b => b.text).join('\n') || 'No response generated'
}
```

## 4. Add Slack Bot Listener

When ready to receive DMs and @mentions, use the Slack Bolt SDK:

```bash
npm install @slack/bolt
```

In a new file `src/slack-bot.ts`:

```typescript
import { App } from '@slack/bolt'
import { runAgent } from './agent/index.js'

const slackBot = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
})

slackBot.message(/.*/, async ({ message, say }) => {
  if (typeof message.text === 'string' && !message.bot_id) {
    const response = await runAgent(message.text)
    await say(response)
  }
})

export default slackBot
```

Then start it in `src/index.ts`:

```typescript
import slackBot from './slack-bot.js'

async function main(): Promise<void> {
  // ... existing code ...
  
  // Start Slack bot listener
  await slackBot.start(process.env.SLACK_BOT_PORT || 3000)
}
```

## 5. Add Required Environment Variables

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret
SLACK_BOT_PORT=3000
```

---

## Notes

- **The tools are already AI-ready.** Every tool exports an `AgentTool` definition with the correct schema. Only the agent/Anthropic wiring needs to be implemented.
- **Tool execution is sandboxed.** Each tool runs independently and returns a `ToolResult`. Errors in one tool don't crash the agent.
- **No refactoring needed elsewhere.** This file is the only place that changes to activate the agent.

---

## Testing

Before deploying to Railway, test locally:

```bash
npm run dev
```

Then send a message to the agent in Slack (once the bot listener is set up) and verify it can call tools and respond intelligently.
