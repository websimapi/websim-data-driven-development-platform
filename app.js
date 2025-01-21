const { useState, useEffect } = React;

// Sample default schema
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
    // This is a simplified parser - in production you'd want to use a proper GraphQL parser
    const entities = {};
    const types = schemaText.split('type').filter(t => t.trim());
    
    types.forEach(type => {
      const [name, ...fields] = type.split('\n').map(l => l.trim()).filter(l => l);
      const className = name.split('{')[0].trim();
      
      entities[className] = `
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from "typeorm";
import { ObjectType, Field, ID } from "type-graphql";

@Entity()
@ObjectType()
export class ${className} {
  @Field(() => ID)
  @PrimaryGeneratedColumn()
  id: number;

  ${fields.map(field => {
    const [fieldName, fieldType] = field.split(':').map(f => f.trim());
    if (fieldType.endsWith('!')) {
      return `
  @Field()
  @Column()
  ${fieldName}: string;
      `.trim();
    }
    return '';
  }).join('\n\n')}
}
      `.trim();
    });

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
        <h2>Generated UI Preview</h2>
        <div className="generated-ui">
          {/* This would show a live preview of the generated UI based on the schema */}
          <pre>{JSON.stringify(generateEntities(schema), null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));