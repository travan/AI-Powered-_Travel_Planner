# Configure Project MCP Skill

## Overview
This skill provides guidance for configuring Model Context Protocol (MCP) connections within the AI-Powered Travel Planner project. MCP enables seamless integration between AI assistants, development tools, and project services like Supabase, allowing for enhanced automation, testing, and development workflows.

## Key Capabilities
- **MCP Server Setup**: Configure MCP servers for project services (Supabase, databases, APIs)
- **Connection Management**: Establish and manage MCP connections for different environments
- **Authentication**: Set up secure authentication for MCP interactions
- **Integration Testing**: Test MCP connections and validate functionality
- **Troubleshooting**: Debug connection issues and optimize performance

## When to Use This Skill
Use this skill when:
- Setting up MCP servers for the first time in the project
- Configuring connections to Supabase or other project services
- Troubleshooting MCP connection failures
- Updating MCP configurations for new environments
- Integrating new MCP-compatible tools or services
- Optimizing MCP performance for development workflows

## Prerequisites
- Node.js and pnpm installed
- Project dependencies installed (`pnpm install`)
- Access to Supabase project credentials
- Basic understanding of MCP concepts and JSON-RPC

## MCP Architecture in the Project

### Supported MCP Servers
- **Supabase MCP**: For database operations, migrations, and API interactions
- **Custom MCP Servers**: For project-specific integrations (AI services, scrapers, etc.)
- **Development Tools MCP**: For enhanced IDE and development workflows

### Connection Types
- **Local Development**: Direct connections for local testing
- **Remote/Cloud**: Secure connections to production services
- **Hybrid**: Combination of local and remote connections

## Configuration Steps

### 1. Environment Setup
Create or update environment variables for MCP configuration:

```bash
# .env.local or .env
MCP_SUPABASE_URL=https://your-project.supabase.co
MCP_SUPABASE_ANON_KEY=your-anon-key
MCP_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
MCP_SERVER_PORT=3001
MCP_LOG_LEVEL=info
```

### 2. MCP Server Configuration
Create a configuration file for MCP servers:

```json
// mcp-config.json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-supabase"],
      "env": {
        "SUPABASE_URL": "${MCP_SUPABASE_URL}",
        "SUPABASE_ANON_KEY": "${MCP_SUPABASE_ANON_KEY}",
        "SUPABASE_SERVICE_ROLE_KEY": "${MCP_SUPABASE_SERVICE_ROLE_KEY}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/project"]
    },
    "custom-ai": {
      "command": "node",
      "args": ["packages/ai/src/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

### 3. Project Integration
Integrate MCP into your development workflow:

```typescript
// lib/mcp-client.ts
import { Client } from '@modelcontextprotocol/sdk';

export class MCPClient {
  private client: Client;

  constructor() {
    this.client = new Client({
      name: 'ai-travel-planner',
      version: '1.0.0',
    });
  }

  async connect(serverName: string) {
    // Connect to specific MCP server
    await this.client.connect(serverName);
  }

  async querySupabase(operation: string, params: any) {
    return await this.client.callTool('supabase', operation, params);
  }

  async generateItineraryWithAI(destination: string, preferences: any) {
    return await this.client.callTool('custom-ai', 'generate-itinerary', {
      destination,
      preferences
    });
  }
}
```

### 4. Authentication Setup
Configure secure authentication for MCP connections:

```typescript
// middleware/mcp-auth.ts
import { NextRequest, NextResponse } from 'next/server';

export function mcpAuthMiddleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.substring(7);
  
  // Validate token against your auth system
  if (!isValidToken(token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  return NextResponse.next();
}
```

## MCP Server Implementation

### Custom MCP Server for AI Services
Create a custom MCP server for AI-powered features:

```typescript
// packages/ai/src/mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

class AITravelServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'ai-travel-planner-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case 'generate-itinerary':
          return await this.generateItinerary(args);
        case 'optimize-route':
          return await this.optimizeRoute(args);
        case 'get-weather':
          return await this.getWeather(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  private async generateItinerary(args: any) {
    // Implement AI itinerary generation
    const { destination, duration, budget, preferences } = args;
    
    // Use your AI service to generate itinerary
    const itinerary = await this.aiService.generateItinerary({
      destination,
      duration,
      budget,
      preferences
    });

    return {
      content: [{ type: 'text', text: JSON.stringify(itinerary) }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('AI Travel MCP Server running on stdio');
  }
}

const server = new AITravelServer();
server.run().catch(console.error);
```

### Supabase MCP Integration
Configure MCP for Supabase operations:

```typescript
// lib/supabase-mcp.ts
import { createClient } from '@supabase/supabase-js';

export class SupabaseMCPService {
  private supabase;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async executeQuery(query: string, params: any[] = []) {
    const { data, error } = await this.supabase.rpc('execute_sql', {
      query,
      params
    });

    if (error) throw error;
    return data;
  }

  async getItineraries(userId: string) {
    const { data, error } = await this.supabase
      .from('itineraries')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    return data;
  }

  async createItinerary(itineraryData: any) {
    const { data, error } = await this.supabase
      .from('itineraries')
      .insert(itineraryData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
```

## Testing MCP Connections

### Connection Tests
```typescript
// e2e/specs/mcp-connection.spec.ts
import { test, expect } from '@playwright/test';
import { MCPClient } from '../../lib/mcp-client';

test.describe('MCP Connection Tests', () => {
  let mcpClient: MCPClient;

  test.beforeAll(async () => {
    mcpClient = new MCPClient();
    await mcpClient.connect('supabase');
  });

  test('should connect to Supabase MCP server', async () => {
    const result = await mcpClient.querySupabase('health_check', {});
    expect(result.status).toBe('ok');
  });

  test('should retrieve itineraries via MCP', async () => {
    const itineraries = await mcpClient.querySupabase('get_itineraries', {
      user_id: 'test-user-id'
    });
    expect(Array.isArray(itineraries)).toBe(true);
  });

  test('should generate itinerary with AI MCP', async () => {
    const itinerary = await mcpClient.generateItineraryWithAI('Tokyo', {
      duration: 7,
      budget: 2000,
      interests: ['culture', 'food']
    });
    expect(itinerary.destination).toBe('Tokyo');
    expect(itinerary.days).toHaveLength(7);
  });
});
```

### Load Testing
```typescript
// scripts/test-mcp-load.ts
import { MCPClient } from '../lib/mcp-client';

async function testMCPLoad() {
  const clients = Array.from({ length: 10 }, () => new MCPClient());
  
  const startTime = Date.now();
  
  await Promise.all(
    clients.map(async (client, i) => {
      await client.connect('supabase');
      await client.querySupabase('get_itineraries', { user_id: `user-${i}` });
    })
  );
  
  const endTime = Date.now();
  console.log(`Load test completed in ${endTime - startTime}ms`);
}
```

## Troubleshooting

### Common Issues
- **Connection Refused**: Check server URLs and ports
- **Authentication Failed**: Verify API keys and tokens
- **Timeout Errors**: Increase timeout settings for slow operations
- **CORS Issues**: Configure proper CORS policies for web clients
- **Rate Limiting**: Implement retry logic with exponential backoff

### Debugging Steps
1. Check MCP server logs: `tail -f mcp-server.log`
2. Validate configuration: `node scripts/validate-mcp-config.js`
3. Test individual connections: `node scripts/test-mcp-connection.js`
4. Monitor performance: `node scripts/monitor-mcp-performance.js`

### Performance Optimization
- **Connection Pooling**: Reuse connections for multiple requests
- **Caching**: Cache frequently accessed data
- **Async Operations**: Use non-blocking operations for better performance
- **Load Balancing**: Distribute requests across multiple MCP servers

## Security Considerations

### Authentication
- Use secure tokens for MCP authentication
- Implement role-based access control
- Rotate API keys regularly
- Monitor for unauthorized access attempts

### Data Protection
- Encrypt sensitive data in transit and at rest
- Implement proper input validation
- Use parameterized queries to prevent injection
- Audit all MCP operations

## Integration with Development Workflow

### CI/CD Integration
```yaml
# .github/workflows/mcp-tests.yml
name: MCP Integration Tests
on: [push, pull_request]

jobs:
  test-mcp:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: pnpm install
      - run: pnpm run test:mcp
      - run: pnpm run test:mcp:load
```

### Development Scripts
```json
// package.json
{
  "scripts": {
    "mcp:start": "node scripts/start-mcp-servers.js",
    "mcp:test": "playwright test e2e/specs/mcp-connection.spec.ts",
    "mcp:validate": "node scripts/validate-mcp-config.js",
    "mcp:monitor": "node scripts/monitor-mcp-performance.js"
  }
}
```

## Resources
- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification)
- [MCP SDK Documentation](https://modelcontextprotocol.io/sdk)
- [Supabase MCP Server](https://github.com/modelcontextprotocol/server-supabase)
- [MCP Community](https://modelcontextprotocol.io/community)

This skill enables robust MCP integration for enhanced automation and AI-powered development in the AI-Powered Travel Planner project.