#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { google, drive_v3, docs_v1, sheets_v4 } from 'googleapis';
import { z } from 'zod';
import { readFileSync } from 'fs';
import express from 'express';
import cors from 'cors';

// Auth setup
function getAuth() {
  const keyContent = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_PATH;
  
  if (keyContent) {
    const key = JSON.parse(keyContent);
    return new google.auth.GoogleAuth({
      credentials: key,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
  }
  
  if (keyPath) {
    return new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });
  }
  
  throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_PATH required');
}

const auth = getAuth();
const drive = google.drive({ version: 'v3', auth });
const docs = google.docs({ version: 'v1', auth });
const sheets = google.sheets({ version: 'v4', auth });

// Tool schemas
const DocReadSchema = z.object({
  fileId: z.string(),
  format: z.enum(['text', 'markdown', 'html']).default('markdown'),
});

const DocWriteSchema = z.object({
  fileId: z.string(),
  content: z.string(),
  mode: z.enum(['replace', 'append']).default('replace'),
});

const DocCreateSchema = z.object({
  title: z.string(),
  folderId: z.string().optional(),
  content: z.string().optional(),
});

const SheetReadSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
});

const SheetWriteSchema = z.object({
  spreadsheetId: z.string(),
  range: z.string(),
  values: z.array(z.array(z.string())),
});

const SheetAppendSchema = z.object({
  spreadsheetId: z.string(),
  sheetName: z.string(),
  values: z.array(z.array(z.string())),
});

const FolderCreateSchema = z.object({
  name: z.string(),
  parentId: z.string().default('root'),
});

const FolderListSchema = z.object({
  folderId: z.string().default('root'),
  pageSize: z.number().default(50),
});

const SearchSchema = z.object({
  query: z.string(),
  pageSize: z.number().default(20),
});

const FileUploadSchema = z.object({
  localPath: z.string(),
  folderId: z.string().optional(),
  name: z.string().optional(),
  mimeType: z.string().optional(),
});

const FileDownloadSchema = z.object({
  fileId: z.string(),
  mimeType: z.string().optional(),
});

const FileDeleteSchema = z.object({
  fileId: z.string(),
});

// Tool definitions
const TOOLS: Tool[] = [
  {
    name: 'gdrive_doc_read',
    description: 'Read a Google Doc as text, markdown, or HTML',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Google Doc file ID' },
        format: { type: 'string', enum: ['text', 'markdown', 'html'], default: 'markdown' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'gdrive_doc_write',
    description: 'Write or append content to a Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Google Doc file ID' },
        content: { type: 'string', description: 'Content to write' },
        mode: { type: 'string', enum: ['replace', 'append'], default: 'replace' },
      },
      required: ['fileId', 'content'],
    },
  },
  {
    name: 'gdrive_doc_create',
    description: 'Create a new Google Doc',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Document title' },
        folderId: { type: 'string', description: 'Parent folder ID (optional)' },
        content: { type: 'string', description: 'Initial content (optional)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'gdrive_sheet_read',
    description: 'Read data from a Google Sheet range',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
        range: { type: 'string', description: 'Range like "Sheet1!A1:D10"' },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'gdrive_sheet_write',
    description: 'Write data to a Google Sheet range',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
        range: { type: 'string', description: 'Range like "Sheet1!A1"' },
        values: { 
          type: 'array', 
          items: { type: 'array', items: { type: 'string' } },
          description: '2D array of values'
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'gdrive_sheet_append',
    description: 'Append rows to a Google Sheet',
    inputSchema: {
      type: 'object',
      properties: {
        spreadsheetId: { type: 'string', description: 'Spreadsheet ID' },
        sheetName: { type: 'string', description: 'Sheet name' },
        values: { 
          type: 'array', 
          items: { type: 'array', items: { type: 'string' } },
          description: '2D array of rows to append'
        },
      },
      required: ['spreadsheetId', 'sheetName', 'values'],
    },
  },
  {
    name: 'gdrive_folder_create',
    description: 'Create a new folder in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder name' },
        parentId: { type: 'string', default: 'root', description: 'Parent folder ID' },
      },
      required: ['name'],
    },
  },
  {
    name: 'gdrive_folder_list',
    description: 'List contents of a Google Drive folder',
    inputSchema: {
      type: 'object',
      properties: {
        folderId: { type: 'string', default: 'root', description: 'Folder ID to list' },
        pageSize: { type: 'number', default: 50 },
      },
    },
  },
  {
    name: 'gdrive_search',
    description: 'Search for files/folders in Google Drive',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (Google Drive query syntax)' },
        pageSize: { type: 'number', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'gdrive_file_delete',
    description: 'Move a file to trash',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'File ID to delete' },
      },
      required: ['fileId'],
    },
  },
];

// Tool handlers
async function handleDocRead(args: z.infer<typeof DocReadSchema>) {
  const { fileId, format } = DocReadSchema.parse(args);
  
  // Export the document
  const mimeType = format === 'html' ? 'text/html' : 'text/plain';
  const response = await drive.files.export({ fileId, mimeType });
  
  let content = response.data as string;
  
  // Simple HTML to Markdown conversion for text format
  if (format === 'markdown') {
    // Basic conversion - strip HTML tags for now, could be enhanced
    content = content
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<[^>]+>/g, ''); // Strip remaining tags
  }
  
  return {
    content: [{ type: 'text', text: content }],
  };
}

async function handleDocCreate(args: z.infer<typeof DocCreateSchema>) {
  const { title, folderId, content } = DocCreateSchema.parse(args);
  
  // Create document
  const doc = await docs.documents.create({
    requestBody: { title },
  });
  
  const fileId = doc.data.documentId!;
  
  // Add content if provided
  if (content) {
    await docs.documents.batchUpdate({
      documentId: fileId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: 1 },
            text: content,
          },
        }],
      },
    });
  }
  
  // Move to folder if specified
  if (folderId) {
    await drive.files.update({
      fileId,
      addParents: folderId,
      fields: 'id, parents',
    });
  }
  
  return {
    content: [{ 
      type: 'text', 
      text: `Created document: ${title}\nID: ${fileId}\nURL: https://docs.google.com/document/d/${fileId}/edit` 
    }],
  };
}

async function handleDocWrite(args: z.infer<typeof DocWriteSchema>) {
  const { fileId, content, mode } = DocWriteSchema.parse(args);
  
  if (mode === 'replace') {
    // Get current document to find end index
    const doc = await docs.documents.get({ documentId: fileId });
    const endIndex = doc.data.body?.content?.at(-1)?.endIndex || 2;
    
    // Delete existing content
    if (endIndex > 2) {
      await docs.documents.batchUpdate({
        documentId: fileId,
        requestBody: {
          requests: [{
            deleteContentRange: {
              range: { startIndex: 1, endIndex: endIndex - 1 },
            },
          }],
        },
      });
    }
    
    // Insert new content
    await docs.documents.batchUpdate({
      documentId: fileId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: 1 },
            text: content,
          },
        }],
      },
    });
  } else {
    // Append mode
    const doc = await docs.documents.get({ documentId: fileId });
    const endIndex = doc.data.body?.content?.at(-1)?.endIndex || 1;
    
    await docs.documents.batchUpdate({
      documentId: fileId,
      requestBody: {
        requests: [{
          insertText: {
            location: { index: endIndex - 1 },
            text: '\n\n' + content,
          },
        }],
      },
    });
  }
  
  return {
    content: [{ type: 'text', text: `Document ${mode === 'replace' ? 'updated' : 'appended'} successfully` }],
  };
}

async function handleSheetRead(args: z.infer<typeof SheetReadSchema>) {
  const { spreadsheetId, range } = SheetReadSchema.parse(args);
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });
  
  const values = response.data.values || [];
  const csv = values.map(row => row.join(',')).join('\n');
  
  return {
    content: [{ type: 'text', text: csv }],
  };
}

async function handleSheetWrite(args: z.infer<typeof SheetWriteSchema>) {
  const { spreadsheetId, range, values } = SheetWriteSchema.parse(args);
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
  
  return {
    content: [{ type: 'text', text: `Updated range ${range} with ${values.length} rows` }],
  };
}

async function handleSheetAppend(args: z.infer<typeof SheetAppendSchema>) {
  const { spreadsheetId, sheetName, values } = SheetAppendSchema.parse(args);
  
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  
  return {
    content: [{ type: 'text', text: `Appended ${values.length} rows to ${sheetName}` }],
  };
}

async function handleFolderCreate(args: z.infer<typeof FolderCreateSchema>) {
  const { name, parentId } = FolderCreateSchema.parse(args);
  
  const response = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name, webViewLink',
  });
  
  return {
    content: [{ 
      type: 'text', 
      text: `Created folder: ${response.data.name}\nID: ${response.data.id}\nURL: ${response.data.webViewLink}` 
    }],
  };
}

async function handleFolderList(args: z.infer<typeof FolderListSchema>) {
  const { folderId, pageSize } = FolderListSchema.parse(args);
  
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    pageSize,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
  });
  
  const files = response.data.files || [];
  const list = files.map(f => {
    const type = f.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
    return `${type} ${f.name} (${f.id})`;
  }).join('\n');
  
  return {
    content: [{ type: 'text', text: list || 'Folder is empty' }],
  };
}

async function handleSearch(args: z.infer<typeof SearchSchema>) {
  const { query, pageSize } = SearchSchema.parse(args);
  
  const response = await drive.files.list({
    q: query,
    pageSize,
    fields: 'files(id, name, mimeType, modifiedTime, webViewLink)',
  });
  
  const files = response.data.files || [];
  const list = files.map(f => {
    const type = f.mimeType === 'application/vnd.google-apps.folder' ? '📁' : '📄';
    return `${type} ${f.name}\n   ID: ${f.id}\n   URL: ${f.webViewLink}`;
  }).join('\n\n');
  
  return {
    content: [{ type: 'text', text: list || 'No files found' }],
  };
}

async function handleFileDelete(args: z.infer<typeof FileDeleteSchema>) {
  const { fileId } = FileDeleteSchema.parse(args);
  
  await drive.files.update({
    fileId,
    requestBody: { trashed: true },
  });
  
  return {
    content: [{ type: 'text', text: `File moved to trash: ${fileId}` }],
  };
}

// Server setup
const server = new Server(
  { name: 'gdrive-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case 'gdrive_doc_read':
        return await handleDocRead(args);
      case 'gdrive_doc_write':
        return await handleDocWrite(args);
      case 'gdrive_doc_create':
        return await handleDocCreate(args);
      case 'gdrive_sheet_read':
        return await handleSheetRead(args);
      case 'gdrive_sheet_write':
        return await handleSheetWrite(args);
      case 'gdrive_sheet_append':
        return await handleSheetAppend(args);
      case 'gdrive_folder_create':
        return await handleFolderCreate(args);
      case 'gdrive_folder_list':
        return await handleFolderList(args);
      case 'gdrive_search':
        return await handleSearch(args);
      case 'gdrive_file_delete':
        return await handleFileDelete(args);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// Start server - supports both stdio (desktop) and HTTP/SSE (browser)
const mode = process.env.MCP_TRANSPORT || 'stdio';

if (mode === 'http' || mode === 'sse') {
  // HTTP/SSE mode for Claude browser
  const app = express();
  app.use(cors());
  
  const transports: Map<string, SSEServerTransport> = new Map();
  
  app.get('/sse', async (req, res) => {
    const transport = new SSEServerTransport('/message', res);
    const sessionId = transport.sessionId;
    transports.set(sessionId, transport);
    
    res.on('close', () => {
      transports.delete(sessionId);
    });
    
    await server.connect(transport);
  });
  
  app.post('/message', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    const transport = transports.get(sessionId);
    if (transport) {
      await transport.handlePostMessage(req, res);
    } else {
      res.status(400).send('Invalid session ID');
    }
  });
  
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`GDrive MCP server running on http://localhost:${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  });
} else {
  // Stdio mode for Claude Desktop
  const transport = new StdioServerTransport();
  server.connect(transport).catch(console.error);
}
