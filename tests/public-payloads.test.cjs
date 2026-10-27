const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');

const sourcePath = path.join(__dirname, '../src/lib/public-payloads.ts');

function loadModule(filename, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, URL, process: { env: { NODE_ENV: 'test' } },
    require(name) {
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
      return imports[name];
    },
  });
  return exports;
}

function loadAllowlists() {
  assert.ok(existsSync(sourcePath), 'Shared public payload allowlists must exist');
  return loadModule(sourcePath);
}

const privateFields = new Set([
  'webhookUrl', 'webhookSecret', 'webhookEvents', 'plan', 'boardsLimit',
  'boardsCount', 'customDomain', 'domainVerified', 'domainVerifiedAt',
  'email', 'emailVerified', 'password', 'passwordHash', 'token',
  'access_token', 'refresh_token', 'id_token', 'sessionToken',
  'apiKeys', 'members', 'memberships', 'accounts', 'sessions',
  'priorityScore', 'totalRequestingMrr', 'customerRequests',
]);

test('public payload allowlists exclude private fields at every depth', () => {
  const allowlists = loadAllowlists();
  function check(value, location) {
    for (const [key, nested] of Object.entries(value)) {
      assert.ok(!privateFields.has(key), `${location}.${key} is not public`);
      assert.notEqual(key, 'include', `${location} must use explicit selects`);
      if (nested && typeof nested === 'object') check(nested, `${location}.${key}`);
    }
  }
  assert.ok(Object.keys(allowlists).length > 0);
  check(allowlists, 'public');
});

test('public payload relations select fields instead of entire rows', () => {
  const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
  const allowlists = loadAllowlists();
  function check(select, modelName) {
    for (const [key, value] of Object.entries(select)) {
      const field = models.get(modelName).fields.find((field) => field.name === key);
      if (field?.kind === 'object') {
        assert.ok(value && typeof value === 'object' && value.select,
          `${modelName}.${key} needs an explicit select`);
        check(value.select, field.type);
      }
    }
  }
  for (const [name, model] of Object.entries({
    publicOrganizationSelect: 'Organization', publicBoardSelect: 'Board',
    publicUserSelect: 'User', publicStatusSelect: 'Status', publicTagSelect: 'Tag',
    publicPostSelect: 'Post', publicCommentSelect: 'Comment',
    publicPostPreviewSelect: 'Post', publicPostSuggestionSelect: 'Post',
    publicRoadmapPostSelect: 'Post', publicChangelogSelect: 'ChangelogEntry',
  })) {
    assert.ok(allowlists[name], `${name} must exist`);
    check(allowlists[name], model);
  }
});

test('public payloads retain the fields used by the public UI', () => {
  const { publicBoardSelect: board, publicPostSelect: post, publicCommentSelect: comment } = loadAllowlists();
  for (const key of ['id', 'name', 'slug', 'description', 'allowAnonymous']) {
    assert.equal(board[key], true, `board.${key}`);
  }
  for (const key of ['id', 'title', 'content', 'voteCount', 'isAnonymous', 'createdAt']) {
    assert.equal(post[key], true, `post.${key}`);
  }
  assert.equal(board.organization.select.showBranding, true);
  assert.equal(post.author.select.name, true);
  assert.equal(post.status.select.color, true);
  assert.equal(post.tags.select.name, true);
  assert.equal(post._count.select.comments.where.isInternal, false);
  assert.equal(comment.author.select.image, true);
});

test('public board page applies the allowlists and narrows the session prop', async () => {
  const allowlists = loadAllowlists();
  const board = { id: 'board', organization: { name: 'Example' } };
  const page = loadModule(path.join(__dirname, '../src/app/(public)/[orgSlug]/[boardSlug]/page.tsx'), {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/navigation': { notFound() { assert.fail('Expected a public board'); } },
    '@/components/boards/public-board-view': { PublicBoardView() {} },
    '@/lib/public-payloads': allowlists,
    '@/lib/auth': { auth: async () => ({ user: { id: 'user', name: 'Reader', image: null, email: 'reader@example.test' } }) },
    '@/lib/db': { db: {
      organization: { findUnique: async () => ({ id: 'org' }) },
      board: { findUnique: async (query) => {
        assert.equal(query.select, allowlists.publicBoardSelect);
        assert.equal(query.include, undefined);
        assert.equal(query.where.isPublic, true);
        assert.equal(query.where.isArchived, false);
        return board;
      } },
      status: { findMany: async (query) => {
        assert.equal(query.select, allowlists.publicStatusSelect);
        return [];
      } },
      post: { findMany: async (query) => {
        assert.equal(query.select, allowlists.publicPostSelect);
        assert.equal(query.include, undefined);
        return [];
      } },
      vote: { findMany: async () => [] },
    } },
  });
  const result = await page.default({ params: Promise.resolve({ orgSlug: 'org', boardSlug: 'board' }), searchParams: Promise.resolve({}) });
  assert.equal(result.props.board, board);
  assert.deepEqual(Object.keys(result.props.user).sort(), ['id', 'image', 'name']);
});

test('posts GET uses the public allowlist anonymously and preserves authenticated responses', async () => {
  const allowlists = loadAllowlists();
  const zod = require('zod');
  const validators = loadModule(path.join(__dirname, '../src/lib/validators/index.ts'), { zod });
  for (const mode of ['anonymous', 'session', 'api-key']) {
    let postQuery;
    const route = loadModule(path.join(__dirname, '../src/app/api/posts/route.ts'), {
      'next/server': require('next/server'), zod,
      '@/lib/public-payloads': allowlists,
      '@/lib/validators': validators,
      '@/lib/auth': { auth: async () => mode === 'session' ? { user: { id: 'user' } } : null },
      '@/lib/api-auth': { authenticateApiKey: async () => mode === 'api-key' ? { organizationId: 'org' } : null },
      '@/lib/ai/categorize': {}, '@/lib/ai/sentiment': {}, '@/lib/ai/similarity': {},
      '@/lib/integrations/slack': { notifyPostCreated: async () => {} },
      '@/lib/db': { db: {
        board: { findUnique: async () => ({ organizationId: 'org' }) },
        post: {
          findMany: async (query) => { postQuery = query; return []; },
          count: async () => 0,
        },
      } },
    });
    const response = await route.GET(new Request('http://localhost/api/posts?boardId=cl00000000000000000000000'));
    assert.equal(response.status, 200, mode);
    if (mode === 'anonymous') {
      assert.equal(postQuery.select, allowlists.publicPostSelect);
      assert.equal(postQuery.include, undefined);
    } else {
      assert.equal(postQuery.select, undefined);
      assert.equal(postQuery.include.author.select.email, undefined);
      assert.equal(postQuery.include._count.select.comments, true);
    }
    assert.equal((await response.json()).pagination.total, 0);
  }
});
