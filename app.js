const { useState, useEffect } = React;

const DEFAULT_SCHEMA = `
type User {
  id: ID!
  name: String!
  email: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  comments: [Comment!]!
}

type Comment {
  id: ID!
  content: String!
  author: User!
  post: Post!
}
`.trim();

function App() {
  const [schema, setSchema] = useState(DEFAULT_SCHEMA);
  const [isConnected, setIsConnected] = useState(false);
  const room = new WebsimSocket();
  
  useEffect(() => {
    room.onopen = () => setIsConnected(true);
    room.onclose = () => setIsConnected(false);
    
    return () => {
      room.close();
    };
  }, []);

  const generateBackendFiles = () => {
    const zip = new JSZip();
    
    // Add package.json with updated dependencies
    zip.file("package.json", JSON.stringify({
      "name": "data-driven-backend",
      "version": "1.0.0",
      "description": "Auto-generated backend from schema",
      "main": "src/index.ts",
      "scripts": {
        "start": "ts-node src/index.ts",
        "build": "tsc",
        "dev": "nodemon",
        "typeorm": "typeorm-ts-node-commonjs"
      },
      "dependencies": {
        "@graphql-tools/schema": "^9.0.19",
        "@types/express": "^4.17.17",
        "@types/node": "^20.3.1",
        "@types/ws": "^8.5.5",
        "express": "^4.18.2",
        "graphql": "^16.7.1",
        "graphql-subscriptions": "^2.0.0",
        "graphql-ws": "^5.14.0",
        "pg": "^8.11.0",
        "reflect-metadata": "^0.1.13",
        "type-graphql": "^2.0.0-beta.2",
        "typeorm": "^0.3.17",
        "typescript": "^5.1.3",
        "ws": "^8.13.0"
      },
      "devDependencies": {
        "nodemon": "^3.0.1",
        "ts-node": "^10.9.1"
      }
    }, null, 2));

    // Generate database config with connection listener
    const dbConfig = `
import { DataSource } from "typeorm";
import path from "path";
import { WebSocket } from "ws";

const entities = path.join(__dirname, "../entities/**/*.ts");

export const AppDataSource = new DataSource({
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "data_driven_db",
  synchronize: true,
  logging: true,
  entities: [entities],
  subscribers: [],
  migrations: [],
});

// Websocket server for connection status
export const wss = new WebSocket.Server({ port: 4001 });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connection', status: AppDataSource.isInitialized }));
  
  AppDataSource.afterConnect(() => {
    ws.send(JSON.stringify({ type: 'connection', status: true }));
  });
  
  AppDataSource.afterDisconnect(() => {
    ws.send(JSON.stringify({ type: 'connection', status: false }));
  });
};
`.trim();

    // Add updated server file with GraphQL subscriptions
    const serverFile = `
import "reflect-metadata";
import express from "express";
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { execute, subscribe } from 'graphql';
import { AppDataSource, wss } from "./config/database";
import { buildSchema } from "type-graphql";
import { resolvers } from "./resolvers";

async function bootstrap() {
  const app = express();
  const httpServer = createServer(app);

  await AppDataSource.initialize();
  
  const schema = await buildSchema({
    resolvers,
    validate: false,
    emitSchemaFile: true,
  });

  // GraphQL over WebSocket server
  useServer(
    {
      schema,
      execute,
      subscribe,
      onConnect: (ctx) => {
        console.log('Client connected');
      },
      onDisconnect: () => {
        console.log('Client disconnected');
      },
    },
    wss
  );

  const port = process.env.PORT || 4000;
  httpServer.listen(port, () => {
    console.log(\`Server ready at http://localhost:\${port}/graphql\`);
    console.log(\`WebSocket server ready at ws://localhost:4001\`);
  });
}

bootstrap().catch(console.error);
`.trim();

    // Create src directory and add files
    const src = zip.folder("src");
    src.file("config/database.ts", dbConfig);
    src.file("index.ts", serverFile);

    // Generate entities with subscriptions support
    const entities = generateEntities(schema);
    const entitiesFolder = src.folder("entities");
    
    Object.entries(entities).forEach(([name, content]) => {
      entitiesFolder.file(`${name}.ts`, content);
    });

    // Generate resolvers with subscriptions
    const resolversFolder = src.folder("resolvers");
    Object.keys(entities).forEach(entityName => {
      resolversFolder.file(`${entityName.toLowerCase()}.ts`, generateResolver(entityName));
    });

    // Add index resolver file
    resolversFolder.file("index.ts", `
export const resolvers = [
  ${Object.keys(entities).map(name => `require('./${name.toLowerCase()}').${name}Resolver`).join(',\n  ')}
];
`.trim());

    // Add README with updated instructions
    zip.file("README.md", `
# Data-Driven GraphQL Backend

This backend was automatically generated from your schema definition.

## Features
- Full TypeScript support
- Real-time subscriptions
- Automatic CRUD operations
- Database synchronization
- WebSocket status monitoring

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Configure your database connection in \`src/config/database.ts\`

3. Start the server:
\`\`\`bash
npm run dev
\`\`\`

## Available Endpoints
- GraphQL API: \`http://localhost:4000/graphql\`
- WebSocket Connection: \`ws://localhost:4001\`

## Development
The schema will automatically sync with your database on startup.
`.trim());

    // Generate ZIP
    zip.generateAsync({type: "blob"})
      .then(content => {
        saveAs(content, "backend.zip");
      });
  };

  function generateResolver(entityName) {
    return `
import { Resolver, Query, Mutation, Arg, Subscription, Root, PubSub, PubSubEngine } from "type-graphql";
import { ${entityName} } from "../entities/${entityName}";
import { AppDataSource } from "../config/database";

@Resolver(${entityName})
export class ${entityName}Resolver {
  private repository = AppDataSource.getRepository(${entityName});

  @Query(() => [${entityName}])
  async getAll${entityName}s(): Promise<${entityName}[]> {
    return this.repository.find();
  }

  @Query(() => ${entityName}, { nullable: true })
  async get${entityName}(@Arg("id") id: number): Promise<${entityName} | null> {
    return this.repository.findOne({ where: { id } });
  }

  @Mutation(() => ${entityName})
  async create${entityName}(
    @Arg("input") input: any,
    @PubSub() pubSub: PubSubEngine
  ): Promise<${entityName}> {
    const entity = this.repository.create(input);
    const result = await this.repository.save(entity);
    await pubSub.publish("${entityName}_CREATED", result);
    return result;
  }

  @Subscription(() => ${entityName}, {
    topics: "${entityName}_CREATED"
  })
  async ${entityName.toLowerCase()}Created(
    @Root() payload: ${entityName}
  ): Promise<${entityName}> {
    return payload;
  }
}
`.trim();
  }

  const generateEntities = (schemaText) => {
    const entities = {};
    const typeRegex = /type\s+(\w+)\s*{([^}]+)}/g;
    let match;

    while ((match = typeRegex.exec(schemaText)) !== null) {
      const [_, typeName, fieldsText] = match;
      const fields = fieldsText.trim().split('\n').map(f => f.trim()).filter(f => f);
      
      let imports = new Set(['Entity', 'PrimaryGeneratedColumn', 'Column', 'ManyToOne', 'OneToMany']);
      
      const fieldDefinitions = fields.map(field => {
        const [name, type] = field.split(':').map(p => p.trim());
        const isRequired = type.endsWith('!');
        const baseType = type.replace(/[!\[\]]/g, '');
        const isList = type.includes('[');
        
        if (baseType === 'ID') {
          return `
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  ${name}: number;`;
        } else if (baseType === 'String') {
          return `
  @Field()
  @Column()
  ${name}: string;`;
        } else {
          if (isList) {
            return `
  @Field(() => [${baseType}])
  @OneToMany(() => ${baseType}, ${baseType.toLowerCase()} => ${baseType.toLowerCase()}.${typeName.toLowerCase()})
  ${name}: ${baseType}[];`;
          } else {
            return `
  @Field(() => ${baseType})
  @ManyToOne(() => ${baseType}, ${baseType.toLowerCase()} => ${baseType.toLowerCase()}.${name})
  ${name}: ${baseType};`;
          }
        }
      });

      const typeormImports = Array.from(imports).join(', ');
      
      entities[typeName] = `
import { ${typeormImports} } from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";
${Object.keys(entities).map(e => `import { ${e} } from "./${e}";`).join('\n')}

@Entity()
@ObjectType()
export class ${typeName} {${fieldDefinitions.join('')}
}`;
    }

    return entities;
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Data-Driven Development Platform</h1>
        <div className="header-controls">
          <div className="connection-status">
            <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></div>
            <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
          <button className="download-btn" onClick={generateBackendFiles}>
            Download Backend
          </button>
        </div>
      </header>

      <div className="schema-editor">
        <h2>Schema Definition</h2>
        <textarea 
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
          placeholder="Enter your GraphQL schema here..."
        />
      </div>

      <div className="preview-section">
        <h2>Generated Entities Preview</h2>
        <div className="generated-ui">
          <pre>{JSON.stringify(generateEntities(schema), null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);