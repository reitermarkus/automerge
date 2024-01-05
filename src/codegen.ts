import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  overwrite: true,
  schema: 'src/github-graphql-schema-loader.ts',
  documents: ['src/mutations/*.graphql', 'src/queries/*.graphql'],
  generates: {
    'src/codegen/github-graphql-schema.ts': {
      plugins: ['typescript', 'typescript-resolvers', 'typescript-document-nodes', 'typescript-operations'],
    },
  },
  require: ['ts-node/register'],
}

export default config
