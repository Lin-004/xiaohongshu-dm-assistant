import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const THREAD_CONFIGS = [
  {
    sectionTitle: '产品规划 / 主线程',
    currentTitle: '[Current] Main / Product Planning',
    nextTitle: '[Next] Main / Product Planning'
  },
  {
    sectionTitle: '技术规划',
    currentTitle: '[Current] Technical Planning',
    nextTitle: '[Next] Technical Planning'
  },
  {
    sectionTitle: '代码编写',
    currentTitle: '[Current] Coding',
    nextTitle: '[Next] Coding'
  },
  {
    sectionTitle: '代码测试',
    currentTitle: '[Current] Testing',
    nextTitle: '[Next] Testing'
  },
  {
    sectionTitle: '代码上传',
    currentTitle: '[Current] Delivery',
    nextTitle: '[Next] Delivery'
  }
];

const DEFAULT_PROJECT_OWNER = process.env.GITHUB_PROJECT_OWNER || 'Lin-004';
const DEFAULT_PROJECT_NUMBER = Number(process.env.GITHUB_PROJECT_NUMBER || '2');
const DEFAULT_STATUS_FILE = path.resolve('docs/thread-status.md');
const STATUS_LABEL_MAP = new Map([
  ['未开始', 'Todo'],
  ['todo', 'Todo'],
  ['进行中', 'In progress'],
  ['in progress', 'In progress'],
  ['完成', 'Done'],
  ['done', 'Done'],
  // The project currently has no "Blocked" option. Keep blocked items visible as in-progress.
  ['阻塞', 'In progress']
]);

export async function runThreadStatusProjectSync(options = {}) {
  const config = await resolveRuntimeConfig(options);
  const markdown = await fs.readFile(config.statusFile, 'utf8');
  const parsed = parseThreadStatusMarkdown(markdown);
  const drafts = buildProjectDraftItems(parsed);

  if (config.dryRun) {
    return {
      dryRun: true,
      projectOwner: config.projectOwner,
      projectNumber: config.projectNumber,
      drafts
    };
  }

  const token = await getGitHubToken(options.token);
  const api = createGitHubGraphQLClient(token);
  const project = await loadProjectMetadata(
    api,
    config.projectOwner,
    config.projectNumber
  );
  const iterationId = getCurrentIterationId(project.iterations, config.today);
  const results = [];

  for (const draft of drafts) {
    const item = await upsertDraftItem(api, project, draft, iterationId);
    results.push(item);
  }

  return {
    dryRun: false,
    projectOwner: config.projectOwner,
    projectNumber: config.projectNumber,
    projectTitle: project.title,
    syncedAt: config.today.toISOString(),
    results
  };
}

export function parseThreadStatusMarkdown(markdown) {
  const totalGoal = normalizeParagraph(extractSection(markdown, '2'));
  const currentStage = normalizeParagraph(extractSection(markdown, '3'));
  const unifiedConclusions = parseBulletList(extractSection(markdown, '4'));
  const scopeSection = extractSection(markdown, '5');
  const inScope = parseBulletList(extractSubSection(scopeSection, 'In Scope'));
  const outOfScope = parseBulletList(extractSubSection(scopeSection, 'Out of Scope'));
  const threadOverview = parseThreadOverviewTable(extractSection(markdown, '6'));
  const threadDetails = parseThreadDetailSections(extractSection(markdown, '7'));
  const blockers = parseBulletList(extractSection(markdown, '8'));
  const nextRound = parseBulletList(extractSection(markdown, '9'));

  return {
    totalGoal,
    currentStage,
    unifiedConclusions,
    inScope,
    outOfScope,
    threadOverview,
    threadDetails,
    blockers,
    nextRound
  };
}

export function buildProjectDraftItems(parsed) {
  return THREAD_CONFIGS.flatMap((config) => {
    const detail = parsed.threadDetails[config.sectionTitle];
    if (!detail) {
      throw new Error(`Missing thread detail section: ${config.sectionTitle}`);
    }

    const overview = parsed.threadOverview[config.sectionTitle];
    const currentStatus = mapStatusLabel(overview?.status || '进行中');
    const currentBody = buildCurrentBody(parsed, config.sectionTitle, detail, overview);
    const nextBody = buildNextBody(parsed, config.sectionTitle, detail, overview);

    return [
      {
        title: config.currentTitle,
        matchPrefix: config.currentTitle,
        status: currentStatus,
        body: currentBody
      },
      {
        title: config.nextTitle,
        matchPrefix: config.nextTitle,
        status: 'Todo',
        body: nextBody
      }
    ];
  });
}

function buildCurrentBody(parsed, sectionTitle, detail, overview) {
  const blocks = [
    `项目总目标：\n${parsed.totalGoal || '未填写'}`,
    `当前阶段：\n${parsed.currentStage || '未填写'}`,
    `线程：${sectionTitle}`,
    '类型：当前状态'
  ];

  if (overview?.task) {
    blocks.push(`状态板任务：\n${overview.task}`);
  }
  if (overview?.status) {
    blocks.push(`状态板状态：\n${overview.status}`);
  }

  for (const section of detail.sections) {
    blocks.push(formatListBlock(section.label, section.items));
  }

  return `${blocks.join('\n\n')}\n`;
}

function buildNextBody(parsed, sectionTitle, detail, overview) {
  const blocks = [
    `项目总目标：\n${parsed.totalGoal || '未填写'}`,
    `当前阶段：\n${parsed.currentStage || '未填写'}`,
    `线程：${sectionTitle}`,
    '类型：下一轮任务'
  ];

  if (overview?.task) {
    blocks.push(`当前任务：\n${overview.task}`);
  }

  const nextSection = detail.sectionMap.get('下一步');
  const decisionSection =
    detail.sectionMap.get('待主线程决策') ||
    detail.sectionMap.get('需要主线程决策');

  blocks.push(formatListBlock('下一步', nextSection?.items || ['无']));

  if (decisionSection?.items?.length) {
    blocks.push(formatListBlock('依赖主线程决策', decisionSection.items));
  }

  return `${blocks.join('\n\n')}\n`;
}

function mapStatusLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  return STATUS_LABEL_MAP.get(key) || 'In progress';
}

function formatListBlock(label, items) {
  const lines = Array.isArray(items) && items.length ? items : ['无'];
  return `${label}：\n${lines.map((item) => `- ${item}`).join('\n')}`;
}

function parseThreadOverviewTable(sectionContent) {
  const lines = sectionContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.startsWith('|'));

  const rows = lines
    .slice(2)
    .map(parseTableRow)
    .filter((row) => row.length >= 7);

  const result = {};
  for (const row of rows) {
    result[row[0]] = {
      owner: row[1],
      task: row[2],
      status: row[3],
      latestConclusion: row[4],
      nextStep: row[5],
      updatedAt: row[6]
    };
  }

  return result;
}

function parseThreadDetailSections(sectionContent) {
  const regex =
    /^###\s+7\.\d+\s+(.+)\n([\s\S]*?)(?=^###\s+7\.\d+\s+|^##\s+8\.|(?![\s\S]))/gm;
  const result = {};
  let match;

  while ((match = regex.exec(sectionContent))) {
    const title = match[1].trim();
    const content = match[2].trim();
    const sections = parseLabeledBlocks(content);
    result[title] = {
      title,
      sections,
      sectionMap: new Map(sections.map((item) => [item.label, item]))
    };
  }

  return result;
}

function parseLabeledBlocks(content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headerMatch = line.match(/^\*\*(.+?)\*\*：\s*(.*)$/);

    if (headerMatch) {
      current = {
        label: headerMatch[1].trim(),
        items: []
      };
      sections.push(current);

      if (headerMatch[2]?.trim()) {
        current.items.push(headerMatch[2].trim());
      }
      continue;
    }

    if (!current) {
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('- ')) {
      current.items.push(trimmed.slice(2).trim());
      continue;
    }

    current.items.push(trimmed);
  }

  return sections;
}

function parseBulletList(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

function parseTableRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function extractSection(markdown, sectionNumber) {
  const regex = new RegExp(
    `^##\\s+${sectionNumber}\\.\\s+[^\\n]+\\n([\\s\\S]*?)(?=^##\\s+\\d+\\.\\s+|(?![\\s\\S]))`,
    'm'
  );
  const match = markdown.match(regex);
  return match?.[1]?.trim() || '';
}

function extractSubSection(content, title) {
  const regex = new RegExp(
    `^###\\s+${escapeRegex(title)}\\n([\\s\\S]*?)(?=^###\\s+|(?![\\s\\S]))`,
    'm'
  );
  const match = content.match(regex);
  return match?.[1]?.trim() || '';
}

function normalizeParagraph(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveRuntimeConfig(options) {
  const today = options.today || new Date();

  return {
    statusFile: path.resolve(options.statusFile || DEFAULT_STATUS_FILE),
    projectOwner: options.projectOwner || DEFAULT_PROJECT_OWNER,
    projectNumber: Number(options.projectNumber || DEFAULT_PROJECT_NUMBER),
    dryRun: Boolean(options.dryRun),
    today
  };
}

async function getGitHubToken(explicitToken) {
  if (explicitToken) {
    return explicitToken;
  }

  const envToken =
    process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }

  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  try {
    const config = await fs.readFile(codexConfigPath, 'utf8');
    const match = config.match(
      /GITHUB_PERSONAL_ACCESS_TOKEN\s*=\s*"([^"]+)"/
    );
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    // Ignore local config lookup and fall through to the final error.
  }

  throw new Error(
    'GitHub token not found. Set GITHUB_TOKEN or GITHUB_PERSONAL_ACCESS_TOKEN, or provide a token through the local Codex config.'
  );
}

function createGitHubGraphQLClient(token) {
  return async function graphql(query, variables = {}) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'xhs-thread-status-sync'
      },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub GraphQL request failed: ${response.status} ${body}`);
    }

    const data = await response.json();
    if (data.errors?.length) {
      throw new Error(
        `GitHub GraphQL error: ${JSON.stringify(data.errors, null, 2)}`
      );
    }

    return data.data;
  };
}

async function loadProjectMetadata(api, owner, number) {
  const query = `
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          title
          fields(first: 50) {
            nodes {
              __typename
              ... on ProjectV2Field {
                id
                name
                dataType
              }
              ... on ProjectV2SingleSelectField {
                id
                name
                dataType
                options {
                  id
                  name
                }
              }
              ... on ProjectV2IterationField {
                id
                name
                dataType
                configuration {
                  iterations {
                    id
                    title
                    startDate
                  }
                }
              }
            }
          }
          items(first: 100) {
            nodes {
              id
              type
              content {
                __typename
                ... on DraftIssue {
                  id
                  title
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await api(query, { owner, number });
  const project = data?.user?.projectV2;
  if (!project) {
    throw new Error(
      `GitHub Project not found for ${owner} project #${number}.`
    );
  }

  const statusField = project.fields.nodes.find(
    (field) => field.name === 'Status' && field.dataType === 'SINGLE_SELECT'
  );
  if (!statusField) {
    throw new Error('Project Status field was not found.');
  }

  const iterationField = project.fields.nodes.find(
    (field) => field.name === 'Iteration' && field.dataType === 'ITERATION'
  );

  return {
    id: project.id,
    title: project.title,
    items: project.items.nodes,
    statusField,
    iterationField,
    iterations: iterationField?.configuration?.iterations || []
  };
}

function getCurrentIterationId(iterations, today) {
  if (!iterations?.length) {
    return null;
  }

  const sorted = [...iterations].sort((left, right) =>
    left.startDate.localeCompare(right.startDate)
  );
  const currentDate = today.toISOString().slice(0, 10);

  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[index + 1];
    const inCurrentWindow =
      current.startDate <= currentDate &&
      (!next || currentDate < next.startDate);

    if (inCurrentWindow) {
      return current.id;
    }
  }

  const latestPast = [...sorted]
    .reverse()
    .find((iteration) => iteration.startDate <= currentDate);
  return latestPast?.id || sorted[0].id;
}

async function upsertDraftItem(api, project, draft, iterationId) {
  const match = findExistingDraft(project.items, draft.matchPrefix);
  const draftIssueId = match?.content?.id;
  const itemId =
    match?.id ||
    (await createDraftItem(api, project.id, draft.title, draft.body)).projectItem.id;

  if (draftIssueId) {
    await updateDraftItem(api, draftIssueId, draft.title, draft.body);
  } else {
    await updateDraftItem(
      api,
      (await getProjectItemDraftIssueId(api, itemId)).draftIssueId,
      draft.title,
      draft.body
    );
  }

  const statusOption = project.statusField.options.find(
    (option) => option.name === draft.status
  );
  if (!statusOption) {
    throw new Error(`Project status option not found: ${draft.status}`);
  }

  await updateItemStatus(api, project.id, itemId, project.statusField.id, statusOption.id);

  if (iterationId && project.iterationField) {
    await updateItemIteration(
      api,
      project.id,
      itemId,
      project.iterationField.id,
      iterationId
    );
  }

  return {
    itemId,
    title: draft.title,
    status: draft.status
  };
}

function findExistingDraft(items, prefix) {
  const matches = items.filter(
    (item) =>
      item.type === 'DRAFT_ISSUE' &&
      item.content?.__typename === 'DraftIssue' &&
      item.content.title.startsWith(prefix)
  );

  if (matches.length > 1) {
    throw new Error(`Duplicate draft items found for prefix: ${prefix}`);
  }

  return matches[0] || null;
}

async function createDraftItem(api, projectId, title, body) {
  const mutation = `
    mutation($projectId: ID!, $title: String!, $body: String!) {
      addProjectV2DraftIssue(
        input: { projectId: $projectId, title: $title, body: $body }
      ) {
        projectItem {
          id
        }
      }
    }
  `;

  const data = await api(mutation, { projectId, title, body });
  return data.addProjectV2DraftIssue;
}

async function getProjectItemDraftIssueId(api, itemId) {
  const query = `
    query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          content {
            __typename
            ... on DraftIssue {
              id
            }
          }
        }
      }
    }
  `;

  const data = await api(query, { itemId });
  const draftIssueId = data?.node?.content?.id;
  if (!draftIssueId) {
    throw new Error(`Draft issue id not found for project item ${itemId}.`);
  }

  return { draftIssueId };
}

async function updateDraftItem(api, draftIssueId, title, body) {
  const mutation = `
    mutation($draftIssueId: ID!, $title: String!, $body: String!) {
      updateProjectV2DraftIssue(
        input: { draftIssueId: $draftIssueId, title: $title, body: $body }
      ) {
        draftIssue {
          id
        }
      }
    }
  `;

  await api(mutation, { draftIssueId, title, body });
}

async function updateItemStatus(api, projectId, itemId, fieldId, optionId) {
  const mutation = `
    mutation(
      $projectId: ID!,
      $itemId: ID!,
      $fieldId: ID!,
      $optionId: String!
    ) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: { singleSelectOptionId: $optionId }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `;

  await api(mutation, { projectId, itemId, fieldId, optionId });
}

async function updateItemIteration(api, projectId, itemId, fieldId, iterationId) {
  const mutation = `
    mutation(
      $projectId: ID!,
      $itemId: ID!,
      $fieldId: ID!,
      $iterationId: String!
    ) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId,
          itemId: $itemId,
          fieldId: $fieldId,
          value: { iterationId: $iterationId }
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `;

  await api(mutation, { projectId, itemId, fieldId, iterationId });
}
