# GDrive MCP Server

MCP server for Google Drive read/write operations. Enables Claude to use Google Docs as project context files.

**Works with:** Claude Desktop (stdio) AND Claude Browser (HTTP/SSE)

## Features

- **Read Google Docs** (export to text/markdown)
- **Write/Update Google Docs** (append or replace content)
- **Google Sheets** (read/update cells, append rows)
- **Folder Operations** (create, list, search)
- **File Upload/Download** (any format)

## Setup

### 1. Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing)
3. Enable APIs:
   - Google Drive API
   - Google Docs API
   - Google Sheets API
4. Create credentials → Service Account
5. Download JSON key file
6. Share your GDrive folders/files with the service account email (looks like: `name@project.iam.gserviceaccount.com`)

### 2. Claude Desktop (Local)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "tsx", "https://raw.githubusercontent.com/shaikh3/gdrive-mcp-server/main/src/index.ts"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY": "{...your key...}"
      }
    }
  }
}
```

### 3. Claude Browser (Web) - Deploy to Vercel

**For Claude browser, you need to deploy the server publicly.**

#### Deploy to Vercel

1. **Fork this repo** to your GitHub
2. **Connect to Vercel:**
   ```bash
   npm i -g vercel
   vercel
   ```
3. **Add environment variable in Vercel Dashboard:**
   - `GOOGLE_SERVICE_ACCOUNT_KEY` = your JSON key content
   - `MCP_TRANSPORT` = `http`
4. **Get your deployed URL:** `https://your-app.vercel.app`

#### Claude Browser Config

In Claude browser (claude.ai), you need an MCP client that connects to your deployed endpoint. Configure it with:

```
Server URL: https://your-app.vercel.app/sse
```

Or if using a custom MCP client:

```json
{
  "mcpServers": {
    "gdrive": {
      "url": "https://your-app.vercel.app/sse"
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes* | JSON content of service account key |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | Alt* | Path to JSON key file |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `PORT` | No | HTTP port (default: 3000) |

*One of KEY or PATH is required

## Tools

### Document Operations

#### `gdrive_doc_read`
Read a Google Doc as text/markdown.
```json
{
  "fileId": "1ABC123...",
  "format": "markdown"
}
```

#### `gdrive_doc_write`
Write/replace content in a Google Doc.
```json
{
  "fileId": "1ABC123...",
  "content": "# Project Context\n\nUpdated from chat...",
  "mode": "replace"
}
```

#### `gdrive_doc_create`
Create a new Google Doc.
```json
{
  "title": "Claude Project - Context",
  "folderId": "1FolderID...",
  "content": "Initial project context..."
}
```

### Sheet Operations

#### `gdrive_sheet_read`
Read range from Google Sheet.
```json
{
  "spreadsheetId": "1SheetID...",
  "range": "Sheet1!A1:D10"
}
```

#### `gdrive_sheet_write`
Write to range in Google Sheet.
```json
{
  "spreadsheetId": "1SheetID...",
  "range": "Sheet1!A1",
  "values": [["Name", "Status"], ["Task 1", "Done"]]
}
```

### Folder Operations

#### `gdrive_folder_create`
Create a new folder.
```json
{
  "name": "Claude Projects",
  "parentId": "root"
}
```

#### `gdrive_search`
Search for files/folders.
```json
{
  "query": "name contains 'Project' and mimeType = 'application/vnd.google-apps.document'"
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run locally (stdio mode - for Claude Desktop)
npm start

# Run in HTTP mode (for Claude Browser)
MCP_TRANSPORT=http npm start

# Dev mode
npm run dev
```

## Your Use Case: Project Context Files

**Claude Desktop:**
```
You: "Update my project context doc with what we just discussed"
Claude: *calls gdrive_doc_write on your context file*
```

**Claude Browser:**
```
You: "Read the project context from gdrive://doc/1ABC123..."
Claude: *fetches and reads via deployed MCP server*
```

**The doc updates in real-time** - accessible from any chat, any device.

## License

MIT
