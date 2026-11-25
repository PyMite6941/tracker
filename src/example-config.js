// Written by `tracker config --init`. Every entry is a working template for a common layout.
export const EXAMPLE_CONFIG = {
  $schema: 'https://pymite6941.github.io/tracker/config.schema.json',
  disable: [],
  agents: [
    {
      name: 'myagent-jsonl',
      label: 'Example JSONL agent (one record per line)',
      format: 'jsonl',
      glob: '~/.myagent/sessions/**/*.jsonl',
      fields: { id: '$filename', cwd: 'cwd', timestamp: 'timestamp', role: 'role', text: 'content', userRole: 'user' },
      resume: { command: 'myagent', args: ['--resume', '{id}'], cwd: '{cwd}' },
    },
    {
      name: 'myagent-json',
      label: 'Example JSON agent (one file per session with a messages array)',
      format: 'json',
      glob: '~/.otheragent/chats/*.json',
      fields: { id: 'id', cwd: 'workspace', title: 'title', messages: 'messages', role: 'role', text: 'content', timestamp: 'createdAt' },
      resume: { command: 'otheragent', args: ['chat', '--session', '{id}'] },
    },
    {
      name: 'myagent-sqlite',
      label: 'Example SQLite agent',
      format: 'sqlite',
      db: '~/.thirdagent/state.db',
      query: 'SELECT id, title, cwd, created_at AS started_at, updated_at, message_count AS messages FROM sessions',
      resume: { command: 'thirdagent', args: ['--continue', '{id}'] },
    },
  ],
};
