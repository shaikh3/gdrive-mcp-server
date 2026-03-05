# GDrive MCP Server

MCP server for Google Drive read/write operations. Enables Claude to use Google Docs as project context files.

## Features

- **Read Google Docs** (export to text/markdown)
- **Write/Update Google Docs** (append or replace content)
- **Google Sheets** (read/update cells, append rows)
- **Folder Operations** (create, list, search)
- **File Upload/Download** (any format)
- **Resource Access** (reference files via `gdrive://` URLs)

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

### 2. Environment Variables

```bash
# Service account JSON (paste the entire content or base64 encode it)
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# Or path to file
GOOGLE_SERVICE_ACCOUNT_PATH=./service-account.json
```

### 3. Claude Desktop Config

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gdrive": {
      "command": "npx",
      "args": ["-y", "@shaikh3/gdrive-mcp-server"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY": "{...your key...}"
      }
    }
  }
}
```

## Tools

### Document Operations

#### `gdrive_doc_read`
Read a Google Doc as text/markdown.
```json
{
  "fileId": "1ABC123...",
  "format": "markdown"  // or "text", "html"
}
```

#### `gdrive_doc_write`
Write/replace content in a Google Doc.
```json
{
  "fileId": "1ABC123...",
  "content": "# Project Context\n\nUpdated from chat...",
  "mode": "replace"  // or "append"
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

#### `gdrive_sheet_append`
Append rows to end of sheet.
```json
{
  "spreadsheetId": "1SheetID...",
  "sheetName": "Sheet1",
  "values": [["New Task", "In Progress"]]
}
```

### File Operations

#### `gdrive_file_upload`
Upload a file to Drive.
```json
{
  "localPath": "/path/to/file.txt",
  "folderId": "1FolderID...",
  "name": "uploaded-file.txt"
}
```

#### `gdrive_file_download`
Download/export a file.
```json
{
  "fileId": "1ABC123...",
  "localPath": "/path/to/save/file.txt",
  "mimeType": "text/plain"
}
```

#### `gdrive_file_delete`
Move file to trash.
```json
{
  "fileId": "1ABC123..."
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

#### `gdrive_folder_list`
List contents of a folder.
```json
{
  "folderId": "1ABC123...",
  "pageSize": 50
}
```

#### `gdrive_search`
Search for files/folders.
```json
{
  "query": "name contains 'Claude' and mimeType = 'application/vnd.google-apps.document'",
  "pageSize": 20
}
```

## Resources

Claude can reference GDrive files directly:

```
Please update the context in gdrive://doc/1ABC123...
```

Resource URIs:
- `gdrive://doc/{fileId}` - Google Doc
- `gdrive://sheet/{spreadsheetId}/{range}` - Sheet range
- `gdrive://folder/{folderId}` - Folder listing

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Dev mode
npm run dev

# Test
npm test
```

## License

MIT
