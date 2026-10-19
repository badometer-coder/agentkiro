/**
 * LLM Handler with Tool Support
 * Wraps LLM calls to support tool execution
 */

import AgentTools from './agent-tools.js';

export class LLMHandler {
  constructor(llmProvider, env) {
    this.llmProvider = llmProvider;
    this.tools = new AgentTools(env);
  }

  /**
   * Call LLM with tool support
   * Handles tool calls in response and executes them
   */
  async callWithTools(messages, options = {}) {
    let response = await this.llmProvider.callLLM(messages, {
      ...options,
      tools: this.tools.getToolDefinitions()
    });

    // Parse tool calls from response
    // Format: [TOOL: tool_name {"param": "value"}]
    const toolCalls = this.parseToolCalls(response);
    
    if (toolCalls.length > 0) {
      console.log(`🔧 Executing ${toolCalls.length} tool(s)...`);
      
      let toolResults = '';
      for (const call of toolCalls) {
        const result = await this.tools.executeTool(call.name, call.params);
        toolResults += `\n[Tool: ${call.name}]\n${result}`;
      }

      // Add tool results back to messages and get final response
      messages.push({ role: 'assistant', content: response });
      messages.push({ role: 'user', content: `Tool results:${toolResults}\n\nNow respond to the user based on these tool results.` });
      
      response = await this.llmProvider.callLLM(messages, options);
    }

    return response;
  }

  /**
   * Parse tool calls from LLM response
   */
  parseToolCalls(response) {
    const toolCalls = [];
    const pattern = /\[TOOL:\s*(\w+)\s*({[^}]*})\]/g;
    
    let match;
    while ((match = pattern.exec(response)) !== null) {
      try {
        const name = match[1];
        const params = JSON.parse(match[2]);
        toolCalls.push({ name, params });
        console.log(`  Found tool call: ${name}(${JSON.stringify(params)})`);
      } catch (e) {
        console.log(`  Failed to parse tool call: ${match[0]}`);
      }
    }

    return toolCalls;
  }
}

export default LLMHandler;
