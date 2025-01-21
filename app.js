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
  const room = new WebsimSocket();
  
  const generateBackendFiles = () => {
    const zip = new JSZip();
    
    // Add package.json
    zip.file("package.json", JSON.stringify({
      "name": "data-driven-backend",
      "version": "1.0.0",
      "description": "Auto-generated backend from schema",
      "main": "src/index.ts",
      "scripts": {
        "start": "ts-node src/index.ts",
        "build": "tsc",
        "dev": "nodemon"
      },
      "dependencies": {
        "@types/express": "^4.17.13",
        "@types/node": "^16.11.7",
        "express": "^4.17.1",
        "apollo-server-express": "^3.6.1",
        "graphql": "^15.8.0",
        "pg": "^8.7.1",
        "reflect-metadata": "^0.1.13",
        "type-graphql": "^1.1.1",
        "typeorm": "^0.2.41",
        "typescript": "^4.5.2"
      },
      "devDependencies": {
        "nodemon": "^2.0.15",
        "ts-node": "^10.4.0"
      }
    }, null, 2));

    // Add README.md
    zip.file("README.md", `
# Data-Driven Backend

This backend was automatically generated from your schema definition.

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Configure your database connection in \`src/config/database.ts\`

3. Run migrations:
\`\`\`bash
npm run typeorm migration:run
\`\`\`

4. Start the server:
\`\`\`bash
npm start
\`\`\`

The GraphQL playground will be available at \`http://localhost:4000/graphql\`
    `.trim());

    // Add TypeScript config
    zip.file("tsconfig.json", JSON.stringify({
      "compilerOptions": {
        "target": "es6",
        "module": "commonjs",
        "lib": ["es6", "dom"],
        "sourceMap": true,
        "outDir": "./dist",
        "moduleResolution": "node",
        "removeComments": true,
        "noImplicitAny": true,
        "strictNullChecks": true,
        "strictFunctionTypes": true,
        "noImplicitThis": true,
        "noUnusedLocals": true,
        "noUnusedParameters": true,
        "noImplicitReturns": true,
        "noFallthroughCasesInSwitch": true,
        "allowSyntheticDefaultImports": true,
        "esModuleInterop": true,
        "emitDecoratorMetadata": true,
        "experimentalDecorators": true,
        "resolveJsonModule": true,
        "baseUrl": "."
      },
      "exclude": ["node_modules"],
      "include": ["./src/**/*.tsx", "./src/**/*.ts"]
    }, null, 2));

    // Create src directory structure
    const src = zip.folder("src");
    
    // Add database config
    src.file("config/database.ts", `
import { ConnectionOptions } from "typeorm";
import path from "path";

export const dbConfig: ConnectionOptions = {
  type: "postgres",
  host: "localhost",
  port: 5432,
  username: "postgres",
  password: "postgres",
  database: "data_driven_db",
  synchronize: true,
  logging: true,
  entities: [path.join(__dirname, "../entities/**/*.ts")],
  migrations: [path.join(__dirname, "../migrations/**/*.ts")],
  subscribers: [path.join(__dirname, "../subscribers/**/*.ts")],
  cli: {
    entitiesDir: "src/entities",
    migrationsDir: "src/migrations",
    subscribersDir: "src/subscribers",
  },
};
`.trim());

    // Add main server file
    src.file("index.ts", `
import "reflect-metadata";
import { createConnection } from "typeorm";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { resolvers } from "./resolvers";
import { dbConfig } from "./config/database";

async function bootstrap() {
  // Create TypeORM connection
  await createConnection(dbConfig);

  // Create Express server
  const app = express();

  // Create Apollo Server
  const schema = await buildSchema({
    resolvers,
    validate: false,
  });

  const server = new ApolloServer({
    schema,
    context: ({ req, res }) => ({ req, res }),
  });

  await server.start();
  server.applyMiddleware({ app });

  // Start server
  const port = process.env.PORT || 4000;
  app.listen(port, () => {
    console.log(\`Server is running on http://localhost:\${port}/graphql\`);
  });
}

bootstrap().catch(console.error);
    `.trim());

    // Generate entities from schema
    const entities = generateEntities(schema);
    const entitiesFolder = src.folder("entities");
    
    Object.entries(entities).forEach(([name, content]) => {
      entitiesFolder.file(`${name}.ts`, content);
    });

    // Generate zip
    zip.generateAsync({type: "blob"})
      .then(content => {
        saveAs(content, "backend.zip");
      });
  };

  const generateEntities = (schemaText) => {
    const entities = {};
    const typeRegex = /type\s+(\w+)\s*{([^}]+)}/g;
    let match;

    while ((match = typeRegex.exec(schemaText)) !== null) {
      const [_, typeName, fieldsText] = match;
      const fields = fieldsText.trim().split('\n').map(f => f.trim()).filter(f => f);
      
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
          // Relationship field
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

      entities[typeName] = `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from "typeorm";
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
        <button className="download-btn" onClick={generateBackendFiles}>
          Download Backend
        </button>
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

ReactDOM.render(<App />, document.getElementById('root'));